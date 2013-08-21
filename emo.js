AUTH = process.env.AUTH;
USERID = process.env.USERID;
ROOMID = process.env.ROOMID;
LASTFM = process.env.LASTFM;

TT_VERSIONS = /\s+\(.* Version\)|\(.*Single.*\)|\(.*Edit.*\)/;
BOPS = /\/dance|\/sway|\/headbang|\/bounce|\/jump|\/groove|\/bop/;

var querystring = require('querystring');
var S = require('string');

var http = require('http');
var Bot = require('ttapi');

var bot = new Bot(AUTH, USERID, ROOMID);

var disconnected = false;
var autobop = false;
var users = {};
var queue = [];
var current_djs = {};
var mods = [];
var snag_count = 0;

var vips = ['4e206f5ca3f75107b30f9798'];

var app = http.createServer(handler);
var io = require('socket.io').listen(app);
var fs = require('fs');

app.listen(process.env.PORT || 5000);

function handler(req, res) {
    fs.readFile('index.html', function(err, data) {
        if (err) {
            res.writeHead(500);
            return res.end("I am having a bad day. How are you?");
        }
        res.writeHead(200, {"Content-Type": "text/html", "Content-Length": data.length});
        res.end(data);
    });
}
 
function connect(roomid) {
  disconnected = false;
 
  bot.roomRegister(roomid, function (data) {
    if (data && data.success) {
      console.log('Joined ' + data.room.name);
    } else {
      console.log('Failed to join room');
      if (!disconnected) {
        disconnected = true;
        setTimeout(connect, 60 * 1000, roomid);
      }
    }
  });
}

function shuffle_playlist() {
    bot.playlistAll(function(playlist) {
        console.log("Playlist length: " + playlist.list.length);
        var i = 0;
        var reorder = setInterval(function() {
            if (i <= playlist.list.length) {
                var nextId = Math.ceil(Math.random() * playlist.list.length);
                bot.playlistReorder(i, nextId);
                i++;
            }
            else {
                clearInterval(reorder);
                console.log("Reorder Ended");
                bot.speak("Playlist shuffled. Chaos reigns. (" + playlist.list.length + " songs loaded)");
            }
        }, 1000);
    });
}

function is_mod(user) {
    if (mods.indexOf(user) >= 0) {
        return true;
    }
    return false;
}

function format_name(name) {
    var user = S(name);
    if (user.startsWith('@')) {
        return name;
    }
    return '@' + name;
}

function yoink() {
    bot.roomInfo(true, function(data) {
        var song = data.room.metadata.current_song._id;
        var songName = data.room.metadata.current_song.metadata.song;
        bot.snag();
        bot.playlistAll(function(playlist) {
            bot.playlistAdd(song, playlist.list.length);
            console.log('Saving ' + song + ' to playlist. (' + playlist.list.length + ')');
            bot.speak("My emotional circuits are overloading.");
        });
    });
}

function vote_status(data) {
    var room = data.room;
    var current_song = room.metadata.current_song;

    values = {
        name: current_song.metadata.song,
        artist: current_song.metadata.artist,
        upvotes: room.metadata.upvotes,
        downvotes: room.metadata.downvotes,
        listeners: room.metadata.listeners,
        snag_count: snag_count
    }
    var str = "♫ {{name}} by {{artist}} earned: ▲ {{upvotes}} ▼ {{downvotes}} ♥ {{snag_count}} ({{listeners}})";
    bot.speak(S(str).template(values).s);
}

function lastfm_call(params, callback) {
    var json = null;
    var options = {
        host: 'ws.audioscrobbler.com',
        port: 80,
        path: '/2.0/?' + querystring.stringify(params)
    }
    http.get(options, function(response) {
        console.log('Last.fm call: ' + response.statusCode);
        var data = '';
        response.on('data', function(chunk) {
            data += chunk;
        });
        response.on('end', function() {
            json = JSON.parse(data);
            callback(json);
        });
    });
}

function artist_bio(seed) {
    var params = {
        method: 'artist.getinfo',
        artist: seed,
        autocorrect: 1,
        api_key: LASTFM,
        format: 'json'
    }
    var response = lastfm_call(params, function(data) {
        var summary = S(data.artist.bio.summary)
        bot.speak(summary.stripTags().decodeHTMLEntities().s);
        if (data.artist.ontour != undefined && data.artist.ontour == 1) {
            var str = "/me SQUEEEEE, {{artist}} is on TOUR!";
            bot.speak(S(str).template({artist: data.artist.name}));
        }
    });
}

function similar_artists(seed) {
    var params = {
        method: 'artist.getsimilar',
        artist: seed,
        limit: 5,
        api_key: LASTFM,
        format: 'json'
    }
    var response = lastfm_call(params, function(data) {
        var artists = [];
        for(var i = 0; i < data.similarartists.artist.length; i++) {
            try {
                artists.push(data.similarartists.artist[i].name);
            } catch(e) {}
        }
        if (artists.length > 0) {
            bot.speak('Similar artists: ' + artists.join(', '));
        }
        else {
            bot.speak('Wait, what band is this?');
        }
    });
}

function similar_tracks(artist, track) {
    // Remove turntable's version indicators
    track = track.replace(TT_VERSIONS, '');
    var params = {
        method: 'track.getsimilar',
        artist: artist,
        track: track,
        limit: 5,
        api_key: LASTFM,
        format: 'json'
    }
    var response = lastfm_call(params, function(data) {
        var tracks = [];
        for(var i = 0; i < data.similartracks.track.length; i++) {
            try {
                var str = "{{artist}} - {{song}}";
                var values = {
                    artist: data.similartracks.track[i].artist.name,
                    song: data.similartracks.track[i].name
                }
                tracks.push(S(str).template(values));
            } catch(e) {}
        }
        if (tracks.length > 0) {
            for (var i = 0; i < tracks.length; i++) {
                bot.speak(tracks[i]);
            }
        }
        else {
            bot.speak('This song is pretty unique, you hipster you.');
        }
    });
}

bot.on('disconnected', function(e) {
  if (!disconnected) {
    disconnected = true;
    console.log("disconnected: " + e);
    setTimeout(connect, 10 * 1000, ROOMID);
  }
});

bot.on('ready', function(data) {
    connect(ROOMID);
});
 
bot.on('roomChanged', function(data) {
    queue = {};
    users = {};
    mods = data.room.metadata.moderator_id;
    current_djs = data.room.metadata.djs;
    
    for (var vip in vips) {
        mods.push(vip);
    }    

    bot.speak("I'm feeling moody.");
});

bot.on('registered', function(data) {
    var user = data.user[0];
    users[user.userid] = user;
    name = format_name(user.name);

    if (!is_mod(user.userid)) {
        var str = "Oh, it's you {{name}}. Hi, I guess.";
        bot.speak(S(str).template({name: name}));
    }
    else if (name == 'kweerious') {
        bot.speak("I feel a sudden surge of random coming on. Hallo, @kweerious.");
    }
    else {
        var str = "Hi {{name}}. I missed you...I think.";
        bot.speak(S(str).template({name: name}));
    }
});

bot.on('deregistered', function(data) {
    var user = data.user[0];

    for (var i = 0; i < queue.length; i++) {
        if (queue[i] == user.name) {
            delete queue[i];
            break;
        }
    }

    bot.roomInfo(true, function(data) {
        // don't dj alone
        if (data.room.metadata.listeners == 1) {
            bot.remDj();
        }
    });
});

bot.on('new_moderator', function(data) {
    mods.push(data.userid);
    console.log('Mod added.');
});

bot.on('rem_moderator', function(data) {
    for (var i = 0; i < mods.length; i++) {
        if (mods[i] == data.userid) {
            delete mods[i];
            break;
        }
    }
    console.log('Mod removed.');
});

bot.on('add_dj', function(data) {
    var user = data.user[0];
    current_djs.push(user);

    for (var i in queue) {
        if (queue[i] == user.name) {
            delete queue[i];
            break;
        }
    }
});

bot.on('rem_dj', function (data) {
    var user = data.user[0];

    for (var d in current_djs.length) {
        if (current_djs[d] == user.name) {
            delete current_djs[d];
            break;
        }
    }

    for (var i in queue) {
        if (queue[i] != '') {
            var str = "{{name}}, your time has come.";
            bot.speak(S(str).template({name: format_name(queue[i])})); 
            break;
        }
    }
});

bot.on('snagged', function(data) {
    // don't respond to your own snags
    if (data.userid == USERID) { return; }

    // only do this on the first snag
    if (snag_count == 0) {
        yoink();
    }
    snag_count++;
});

bot.on('newsong', function(data) {
    snag_count = 0;
    if (autobop) {
        bot.bop();
    }
});

bot.on('endsong', function(data) {
    vote_status(data);
});

bot.on('speak', function(data) {
    var text = data.text;
    var user = data.userid;
    var dance_moves = BOPS;

    // bot should ignore it's own chat messages
    if (user == USERID) { return; }

    if (text.match(dance_moves)) {
        bot.vote('up');
    }
    else if (text.match(/^\/help$/)) {
        bot.speak('/q, /q+, /q-, /dance, /last, /song, /bio, /artists, /tracks, /stats');
    }
    else if (text == '/ab') {
        if (!is_mod(data.userid)) { return false; }
        autobop = !autobop;
        if (autobop) {
            bot.speak("I'll bite. This is awesome.");
            bot.vote('up');
        }
        else {
            bot.speak("Everything you play is so last century. Not awesome.");
            bot.vote('down');
        }
    } 
    else if (text == '/dj') {
        if (!is_mod(data.userid)) { return false; }
        bot.speak(':sulk:');
        bot.addDj();
    }
    else if (text == '/djstop') {
        if (!is_mod(data.userid)) { return false; }
        bot.speak('Thanks for noticing me.');
        bot.remDj();
    }
    else if (text == '/skip') {
        if (!is_mod(data.userid)) { return false; }
        bot.skip(function() {
            bot.speak("¯\\_(ツ)_/¯");
        });
    }
    else if (text == '/yoink') {
        if (!is_mod(data.userid)) { return false; }
        yoink();
    }
    else if (text.match(/^\/last$/)) {
        bot.roomInfo(true, function(data) {
            var log = data.room.metadata.songlog;
            var last = log[log.length - 2];

            var str = "Last song: :notes: {{artist}} - {{song}}.";
            var values = {
                artist: last.metadata.artist,
                song: last.metadata.song
            }
            bot.speak(S(str).template(values).s);
        });
    }
    else if (text.match(/^\/song$/)) {
        bot.roomInfo(true, function(data) {
            var current_song = data.room.metadata.current_song;
            if (current_song) {
                var str = ":notes: {{name}} :cd: Album: {{album}}";
                var values = {
                    album: current_song.metadata.album,
                    name: current_song.metadata.song
                }
                bot.speak(S(str).template(values).s);
            }
            else {
                bot.speak(':exclamation: No song is playing.');
            }
        });
    }
    else if (message = text.match(/^\/bio\s?(.*)?$/)) {
        if (message[1] == undefined) {
            bot.roomInfo(true, function(data) {
                var current_song = data.room.metadata.current_song;
                if (current_song) {
                    artist = current_song.metadata.artist;
                    artist_bio(artist);
                }
            });
        }
        else {
            artist_bio(message[1]);
        }
    }
    else if (message = text.match(/^\/artists\s?(.*)?$/)) {
        if (message[1] == undefined) {
            bot.roomInfo(true, function(data) {
                var current_song = data.room.metadata.current_song;
                if (current_song) {
                    var artist = current_song.metadata.artist;
                    similar_artists(artist);
                }
            });
        }
        else {
            similar_artists(message[1]);
        }
    }
    else if (text.match(/^\/tracks\s?(.*)?$/)) {
        bot.roomInfo(true, function(data) {
            var current_song = data.room.metadata.current_song;
            if (current_song) {
                var artist = current_song.metadata.artist;
                var song = current_song.metadata.song;
                similar_tracks(artist, song);
            }
        });
    }
    else if (text.match(/^\/stats$/)) {
        bot.roomInfo(true, function(data) {
            vote_status(data);
        });
    }
    else if (text.match(/^\/q\-$/)) {
        for (var i in queue) {
            if (queue[i] == data.name) {
                delete queue[i];
                var str = "{{name}} has been removed.";
                bot.speak(S(str).template({name: data.name}));
                break;
            }
        }
    }
    else if (text.match(/^\/q$/)) {
        var dj_list = '';
        var count = 1;
        for (var i in queue) {
            dj_list = dj_list.concat(count,'. ', queue[i], ' ');
            count++;
        }
        if (dj_list == '') {
            dj_list = 'Empty!';
        }
        bot.speak('Queue: ' + dj_list);
    }
    else if (text.match(/^\/q\+$/)) {
        bot.roomInfo(false, function (roomdata) {
            var djs = roomdata.room.metadata.djs;
            var dj_count = roomdata.room.metadata.djcount;
            var name = format_name(data.name);

            if (dj_count < 5 && queue.length) {
              bot.speak('No one in line, hop up.');
            }
            else if (djs.indexOf(data.userid) == -1) {
                queue[data.userid] = data.name;
                
                var str = "{{name}} has been added to the queue."
                bot.speak(S(str).template({name: name}));
            }
            else if (djs.indexOf(data.userid) >= 0) {
                var str = "{{name}} you are on the decks.";
                bot.speak(S(str).template({name: name}));
            }
        });
    }
    else if (text.match(/hearts|\/hearts?|<3/)) {
        bot.speak(':heart::yellow_heart::green_heart::blue_heart::purple_heart:');
    }
    else if (text.match(/lol|LOL/)) {
        bot.speak('My humor chip is malfunctioning. Was there a joke?');
    }
    else if (message = text.match(/(\/highfive|\/high5)\s?(@\w+)?/)) {
        var name = format_name(data.name);
        if (message[2] != undefined) {
            name = format_name(message[2]);
        }
        var str = ":pray: Up high {{name}}"
        bot.speak(S(str).template({name: name}));
    }
    else if (message = text.match(/(\/fistbump|\/fist)\s?(@\w+)?/)) {
        var name = format_name(data.name);
        if (message[2] != undefined) {
            name = format_name(message[2]);
        }
        var str = ":fist: {{name}}. Yeah, we bad.";
        bot.speak(S(str).template({name: name}));
    }
    else if (text.match(/\/rave|\/party|glowstick/)) {
        bot.speak(':traffic_light::pill::rotating_light::stuck_out_tongue_winking_eye::traffic_light:');
    }
});

bot.on('pmmed', function(data) {
    var text = data.text;
    var sender = data.senderid;
    var user = data.userid;

    // bot should ignore it's own chat messages
    if (sender == USERID) { return; }

    // ignore non-mods
    if(!is_mod(user)) {
        bot.pm("I'm too tired to talk", sender);
        return false;
    }

    if (text.match(/^\/help$/)) {
        bot.pm('/ab, /dj, /djstop, /yoink, /skip, /shuffle, /songs, /echo, /escort', sender);
    }
    else if (text.match(/^\/dj$/)) {
        bot.pm('Fine...', sender);
        bot.addDj();
    }
    else if (text.match(/^\/djstop$/)) {
        bot.pm(':sigh:', sender);
        bot.remDj();
    }
    else if (text.match(/^\/ab$/)) {
        autobop = !autobop;
        if (autobop) {
            bot.pm("Yeah, sure.", sender);
            bot.vote('up');
        }
        else {
            bot.pm("Going to sleep then", sender);
        }
    }
    else if (text.match(/^\/skip$/)) {
        bot.pm("Ouch.", sender);
        bot.skip();
    }
    else if (text.match(/^\/yoink$/)) {
        yoink();
    }
    else if (text.match(/^\/shuffle$/)) {
        shuffle_playlist();
    }
    else if (text.match(/^\/songs$/)) {
        bot.roomInfo(true, function(data) {
            bot.playlistAll(function(playlist) {
                var note = playlist.list.length + ' songs in queue';
                bot.pm(note, sender);
            });
        });
    }
    else if (message = text.match(/^\/echo (.*)$/)) {
        bot.speak(message[1].trim());
    }
    else if (text.match(/^\/escort$/)) {
        bot.roomInfo(true, function(data) {
            bot.remDj(data.room.metadata.current_dj, function() {
                bot.speak("Hmph.");
                bot.speak("(╯°□°）╯︵ ┻━┻");
            });
        });
    }
});