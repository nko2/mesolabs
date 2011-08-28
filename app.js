
/**
 * Module dependencies.
 */

var express = require('express'),
    socketio = require('socket.io'),
    events = require('events')
    nko = require('nko')('sWq0rm8zUcxb3Isa'),
    RedisStore = require('connect-redis')(express),
    redis = require('redis'),
    scraper = require('./lib/scraper'),
    http = require('http');

var app = module.exports = express.createServer();
var db = redis.createClient();
db.del('namespaces', redis.print); // connectionのリスナが登録済のユーザ
var home = 'http://mesolabs.no.de/';

// Configuration
app.configure(function(){
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({
    secret: 'mesolabs',
    store: new RedisStore()
  }));
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  home = 'http://localhost:3000/';
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
});

app.configure('production', function(){
  app.use(express.errorHandler());
});

// Routes
const TITLE = 'Stalkr';

app.get('/', function(req, res){
  res.render('index', {
    title: TITLE
  });
});

app.get('/:name', function(req, res) {
  var name = req.params.name;
  db.get('name#' + name, function(err, value) {
    if (err) return console.log('Redis Error: ' + err);
    if (value) {
      addChannel(name);
      res.render('individual', {
        title: TITLE,
        name: name,
        home: home
      });
    } else {
      res.render('lethimknow', {
        title: TITLE,
        name: name
      });
    }
  });
});

function getUser(name, callback) {
  db.get('name#' + name, function(err, value) {
    if (err) return callback(err);
    if (value) {
      return callback(null, JSON.parse(value));
    } else {
      http.get({
        host: 'api.twitter.com',
        port: 80,
        path: '/1/users/profile_image/' + name + '.json'
      }, function(res) {
        var user = {
          name: name,
          profile_url: res.headers.location
        };
        db.set('name#' + name, JSON.stringify(user), redis.print);
        return callback(null, user);
      });
    }
  });
}


var ee = new events.EventEmitter();
app.post('/', function(req, res) {
  var name = req.body.name;
  var url = req.body.url;
  var timestamp = new Date().getTime();
  if (!name || name === 'undefind') return res.send(200);
  if (!url) return res.send(200);
  if (url.lastIndexOf('http') !== 0) return res.send(200);

  getUser(name, function(err, user) {
    if (err) return console.log('getUser Error:' + err);
    scraper(url, function(err, $) {
      if (err) return console.log('Scraping Error:' + err);
      var title = $('title').text().trim();
      if (title) {
        url = decodeURIComponent(url);
        console.log(name + ": " + title + "(" + url + ")");
        var data = {
          user: user,
          url: url,
          title: title,
          timestamp: timestamp
        };
        saveCache(name, data);
        saveCache('_all', data);
        ee.emit(name, data);
        ee.emit('_all', data);
      }
    });
  });
  res.send(200);
});

function saveCache(name, data) {
  db.llen(name, function(err, len) {
    if (err) return console.log('Redis Error: ' + err);
    if (len >= 30) {
      db.lpop(name, redis.print);
    }
    db.rpush(name, JSON.stringify(data), redis.print);
  });
}

app.listen(process.env.PORT || 3000);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

var io = socketio.listen(app);
io.set('polling duration', 60 * 60);
io.set('close timeout', 60 * 60);
function addChannel(name) {
  db.sismember('namespaces', name, function(err, value) {
    if (err) return console.log('Redis Error: ' + err);
    if (value === 1) return;
    io.of('/' + name).on('connection', function(socket) {
      db.lrange(name, 0, 29, function(err, value) {
        if (err) return console.log('Redis Error: ' + err);
        value.forEach(function(element, index, array) {
          socket.emit('access', JSON.parse(element));
        });
      });
      ee.on(name, function(data) {
        socket.emit('access', data);
      });
    });
    db.sadd('namespaces', name, redis.print);
  });
}

io.sockets.on('connection', function(socket) {
  db.lrange('_all', 0, 29, function(err, value) {
    if (err) return console.log('Redis Error: ' + err);
    value.forEach(function(element, index, array) {
      socket.emit('access', JSON.parse(element));
    });
  });
  ee.on('_all', function(data) {
    socket.emit('access', data);
  });
});

process.on('uncaughtException', function(err) {
  console.log('uncaughtException:' + err);
});

