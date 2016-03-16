var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var cors = require('cors');
var mongo = require('promised-mongo');

var routes = require('./routes/api');
var users = require('./routes/users');
var auth = require('./routes/auth');

var dbURL = 'mongodb://localhost:27017/drawlol' //|| process.env.DATABASE_URL;
var db = mongo(dbURL, 'games');

server.listen(8000);

io.on('connection', function(socket){
  console.log('user connected');
  socket.emit('handshake', {});
  socket.on('joinRoom', function(data){
    console.log(data.roomName);
    socket.join(`${ data.roomName }`);
    io.to(`${data.roomName}`).emit('userJoined',{user: data.user});
    db.collection('games').findOne({'room': data.roomName}).then(function(gameData){
      console.log(gameData);
      if(gameData === null){
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
        }).then(function(){
          socket.emit('joinSuccess', {roomName: data.roomName, creator: true})
          console.log('successfully created game room');
        })
      }else{
        var usernameInGame = checkDbForUser(gameData, data.user);
        if(!usernameInGame){
          console.log('here', gameData.players);
          gameData.players.push({username: data.user, sheet: []});
          console.log('here too', gameData.players);
          db.collection('games').findAndModify({
            query: {'room': data.roomName },
            update: {$set: {'players': gameData.players}}
          }).then(function(data){
            console.log('successfully added player to db', gameData.players);
          })
        }
        console.log('room exists in db');
      }
      console.log('database connected', data);
    })
  })
  socket.on('chatMessage', function(data){
    io.to(data.room).emit('chatMessage', {message: data.message, user: data.user})
  })
  socket.on('sheetSubmit', function(data){
    console.log(data);
    //insert into database and query for round array length here to determine if round is over
    db.collection('games').findOne({'room': data.roomName}).then(function(gameData){
      console.log('in find callback', gameData);
      gameData.players.forEach(function(player){
        if( player.username == data.sheet){
          console.log('in first if', player.username);
          if(data.phase == 'draw'){
            console.log('draw');
            player.sheet.push(data.image);
          }else if(data.phase == 'view'){
            console.log('view');
            player.sheet.push(data.sentence)
          }
          var round = data.round.toString();
          console.log('round number is', round);
          console.log('gameData', gameData.rounds[round]);
          console.log('user', data.user);
          gameData.rounds[round].push(data.user);
        }
      })
      db.collection('games').findAndModify({
        query: {'room': data.roomName },
        update: {$set: {'players': gameData.players, 'rounds': gameData.rounds}}
      }).then(function(){
        socket.emit('success', {});
        db.collection('games').findOne({'room': data.roomName}).then(function(gameData){
          var round = data.round.toString();
          console.log('result of last find', gameData, 'round', round);
          console.log('length', gameData.rounds[round].length, gameData.players.length);
          if (gameData.rounds[round].length == gameData.players.length){
            io.to(data.roomName).emit('nextRound', {round: parseInt(gameData.current_round) + 1})
          }
        })
      })
    })
  })
  socket.on('leaveRoom', function(data){
    io.to(data.room).emit('userDisconnect', {
      user: data.user
    })
  });
  socket.on('start', function(data){
    console.log('start', data);
    io.to(data.room).emit('startGame', {})
  })
})

function checkDbForUser(data, user){
  console.log('in checkDbForUser', data.players);
  var findUser = data.players.filter(function(player){
    console.log(player);
    return player.username.toLowerCase() == user.toLowerCase()
  });
  console.log('findUser', findUser);
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

app.use('/api', routes);
app.use('/users', users);
app.use('/auth', auth);

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
