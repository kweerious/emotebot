AUTH = process.env.AUTH;
USERID = process.env.USERID;
ROOMID = process.env.ROOMID;

var Bot = require('ttapi');
var bot = new Bot(AUTH, USERID, ROOMID);

var disconnected = false;
var autobop = false;
var users = {};
var queue = [];
var current_djs = {};
var mods = [];
var snag_count = 0;

var vips = ['4f3dc5caa3f751054100073f', '4e1f4038a3f75107c708a2b2', '4e206f5ca3f75107b30f9798'];

var app = require('http').createServer(handler);
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

function is_mod(user) {
    if (mods.indexOf(user) >= 0) {
        return true;
    }
    return false;
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

    if (!is_mod(user.userid)) {
        bot.speak("Oh, it's you @" + user.name + ". Hi, I guess.");
    }
    else if (user.name == 'kweerious') {
        bot.speak("I feel a sudden surge of random coming on. Hallo, @kweerious.");
    }
    else {
        bot.speak("Hi @" + user.name.replace('@', '') + ". I missed you...I think.");
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
			bot.speak('@' + queue[i] + ', your time has come.'); 
			break;
		}
	}
});

bot.on('snagged', function(data) {
    // only do this on the first snag
    if (snag_count == 0) {
        bot.speak("My emotional circuits are overloading.");
        bot.roomInfo(true, function(data) {
            var song = data.room.metadata.current_song._id;
            var songName = data.room.metadata.current_song.metadata.song;
        	bot.snag();
          	bot.playlistAll(function(data) {
          	    bot.playlistAdd(song, data.list.length);
          	});
        });
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
	var room = data.room;
	var upvotes = room.metadata.upvotes;
	var downvotes = room.metadata.downvotes;
	var listeners = room.metadata.listeners;
    var current_song = room.metadata.current_song;
    
    if (current_song) {
        var name = current_song.metadata.song;
        var artist = current_song.metadata.artist;
    
    	bot.speak('♫ "' + name +'" by ' + artist + ' earned: ▲' + upvotes + ' ▼'
            + downvotes + ' ♥' + snag_count + ' (' + listeners + ')');
    }
});

bot.on('speak', function(data) {
    var text = data.text;
    
    if (text.match(/\/dance|\/sway|\/headbang|\/bounce|\/jump|\/groove|\/bop/)) {
        bot.vote('up');
    }
	else if (text.match(/^\/help$/)) {
	    bot.speak('/q, /q+, /q-, /dance, /last, /song, /votes');
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
            bot.speak("¯\_(ツ)_/¯");
        });
    }
    else if (text == '/yoink') {
        if (!is_mod(data.userid)) { return false; }

        bot.roomInfo(true, function(data) {
            var song = data.room.metadata.current_song._id;
            var songName = data.room.metadata.current_song.metadata.song;
        	bot.snag();
          	bot.playlistAll(function(data) {
          	    bot.playlistAdd(song, data.list.length);
          	});
        });
    }
    else if (text.match(/^\/last$/)) {
        bot.speak('Last song:');

        bot.roomInfo(true, function(data) {
            var log = data.room.metadata.songlog;
            var last = log[log.length - 2];
            bot.speak(':notes: ' + last.metadata.artist + ' - ' + last.metadata.song + '.');
        });
    }
    else if (text.match(/^\/song$/)) {
        bot.roomInfo(true, function(data) {
        	var current_song = data.room.metadata.current_song;
        	if (current_song) {
            	var songId = current_song._id;
            	var album = current_song.metadata.album;
            	var name = current_song.metadata.song;

                bot.speak(':notes: "' + name + '" :cd: Album: ' + album);
            }
            else {
                bot.speak(':exclamation: No song is playing.');
            }
        });
    }
	else if (text.match(/^\/votes$/)) {
		bot.roomInfo(true, function(data) {
        	var room = data.room;
        	var upvotes = room.metadata.upvotes;
        	var downvotes = room.metadata.downvotes;
        	var listeners = room.metadata.listeners;
            var current_song = room.metadata.current_song;
            var name = current_song.metadata.song;
            var artist = current_song.metadata.artist;
    
        	bot.speak('♫ "' + name +'" by ' + artist + ' earned: ▲' + upvotes + ' ▼'
                + downvotes + ' ♥' + snag_count + ' (' + listeners + ')'); 
        });
    }
    else if (text.match(/^\/q\-$/)) {
        for (var i in queue) {
     		if (queue[i] == data.name) {
     			delete queue[i];
     			bot.speak('@' + data.name + ' has been removed.');
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
            dj_count = roomdata.room.metadata.djcount;
            if (dj_count < 5 && queue.length) {
              bot.speak('No one in line, hop up.');
            }
     		else if (djs.indexOf(data.userid) == -1) {
     		    queue[data.userid] = data.name;
                bot.speak('@' + data.name + ' has been added to the queue.');
     		}
            else if (djs.indexOf(data.userid) >= 0) {
                bot.speak(data.name + ' you are on the decks.');
     		}
        });
        console.log(queue);
    }
});

bot.on('pmmed', function(data) {
    var text = data.text;
    var sender = data.senderid;
    var user = data.userid;

    // ignore non-mods
    if(!is_mod(user)) {
        bot.pm("I'm too tired to talk", sender);
        return false;
    }

	if (text.match(/^\/help$/)) {
	    bot.speak('/ab, /dj, /djstop, /yoink, /skip, /shuffle, /escort');
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
        bot.roomInfo(true, function(data) {
            var song = data.room.metadata.current_song._id;
            var songName = data.room.metadata.current_song.metadata.song;
        	bot.snag();
          	bot.playlistAll(function(data) {
          	    bot.playlistAdd(song, data.list.length);
          	});
        });
    }
    else if (text.match(/^\/shuffle$/)) {
        bot.playlistAll(function(playlist) {
            console.log("Playlist length: " + playlist.list.length);
                var i = 0;
                var reorder = setInterval(function() {
                if (i <= playlist.list.length) {
                    var nextId = Math.ceil(Math.random() * playlist.list.length);
                    bot.playlistReorder(i, nextId);
                    console.log("Song " + i + " changed.");
                    i++;
                } else {
                clearInterval(reorder);
                console.log("Reorder Ended");
                bot.pm("Entropy achieved.", sender);
                bot.speak("Playlist shuffled. Chaos reigns. (" + playlist.list.length + " songs loaded)");
            }
          }, 1000);
        });
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