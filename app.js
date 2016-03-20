var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var cors = require('cors');
var mongo = require('mongodb');
var promise = require('promise');
require('dotenv').load();

// var routes = require('./routes/api');
// var users = require('./routes/users');
// var auth = require('./routes/auth');

var dbURL = (process.env.MONGOLAB_URI || 'mongodb://localhost:27017/');//+ 'drawlol';

var database = {
  connect: function(){
    return new Promise(function(resolve, reject){
      mongo.MongoClient.connect(dbURL, function(err, db){
        if(err){
          console.log(err);
          reject(err);
        }else{
          console.log('success');
          resolve(db);
        }
      })
    })
  }
}

server.listen(process.env.PORT || 8000);

io.on('connection', function(socket){
  console.log('connection');
  socket.emit('handshake', {});
  socket.on('joinRoom', function(data){
    console.log('joinRoom', data);
    socket.join(data.roomName);
    io.to(data.roomName).emit('userJoined',{user: data.user});
    database.connect().then(function(db){
      db.collection('games').findOne({'room': data.roomName}, function(err, gameData){
      if(gameData === null){
        // database.connect().then(function(db){
          db.collection('games').insert({
            room: data.roomName,
            created_by: data.user,
            date: new Date(),
            players: [{username: data.user, sheet: []}],
            finished: false,
            cancelled: false,
            in_process: true,
            current_round: 1,
            rounds: {
              1: []
            }
          })
          db.close();
        // })
        socket.emit('joinSuccess', {roomName: data.roomName, creator: true, created_by: data.user});
        io.to(data.roomName).emit('userJoined', {players: [{username: data.user, sheet: []}]})
      }else if (data.user != null){
        console.log('gameData', gameData);
        gameData.players.push({username: data.user, sheet: []});
        console.log('gameData', gameData);
        db.collection('games').update({'room': data.roomName }, {$set: {'players': gameData.players}});
          socket.emit('joinSuccess', {
          players: gameData.players,
          roomName: gameData.roomName,
          creator: false,
          created_by: gameData.created_by
          });
        io.to(gameData.room).emit('userJoined', {players: gameData.players});
        db.close();
      }
    })
      // db.close();
    })
  })

  socket.on('chatMessage', function(data){
    io.to(data.room).emit('chatMessage', {message: data.message, user: data.user})
  })

  socket.on('sheetSubmit', function(data){
    console.log(data);
    database.connect().then(function(db){
      db.collection('games').findOne({'room': data.roomName}, function(err, gameData){
        if(err){console.log(err);}
        console.log(gameData);
        gameData.players.forEach(function(player){
          if( player.username == data.sheet){
            if(data.phase == 'draw'){
              console.log('draw');
              player.sheet.push(data.image);
            }else if(data.phase == 'view'){
              console.log('view');
              player.sheet.push(data.sentence)
            }
          }
        });
        socket.emit('success', {});
        var round = data.round.toString();
        if(gameData.rounds[round]){
          gameData.rounds[round].push(data.user);
        }else{
          gameData.rounds[round] = [data.user]
        }
        if (gameData.rounds[round].length >= gameData.players.length){
          gameData.current_round += 1;
          if(gameData.current_round > (gameData.players.length + 1)){
            gameData.finished = true;
            gameData.in_process = false;
            io.to(data.roomName).emit('gameOver', {players: gameData.players});
          }
          if(gameData.in_process){
            io.to(data.roomName).emit('nextRound', {round: parseInt(gameData.current_round), players: gameData.players})
          }
        }
        db.collection('games').update({'room': data.roomName },
        {$set: {'players': gameData.players, 'rounds': gameData.rounds, 'finished': gameData.finished, 'in_process': gameData.in_process, 'current_round': gameData.current_round}});
        db.close();
      });
  })
})
  socket.on('leaveRoom', function(data){
    console.log('left room', data.user);
    database.connect().then(function(db){
      db.collection('games').findOne({'room': data.room}, function(gameData){
        if(gameData.in_process == true){
          console.log('gameData.in_process', gameData);
          var newPlayerList = gameData.players.filter(function(player){
            return player.username != data.user
          })
          db.collection('games').update({'room': data.roomName}, {$set: {'players': newPlayerList}})
          db.close();
          io.to(data.room).emit('userDisconnect', {players: newPlayerList});
    }
    })
  });
});

  socket.on('start', function(data){
    console.log('start');
    database.connect().then(function(db){
      db.collection('games').findOne({'room': data.room}, function(err, gameData){
        if(err){console.log(err);}
        console.log(gameData);
        db.close();
        io.to(data.room).emit('startGame', {players: gameData.players})
      })
    })
  })
})


function checkDbForUser(data, user){
  var findUser = data.players.filter(function(player){
    return player.username.toLowerCase() == user.toLowerCase()
  });
  if(findUser.length){
    return true;
  }else{
    return false;
  }
}



// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(cors());

app.get('/', function(req, res, next){
  res.send('app is running');
});

// app.use('/api', routes);
// app.use('/users', users);
// app.use('/auth', auth);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.json({error: err});
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({error: err})
});


// module.exports = app;
