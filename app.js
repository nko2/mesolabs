
/**
 * Module dependencies.
 */

var express = require('express'),
    socketio = require('socket.io'),
    events = require('events')
    nko = require('nko')('sWq0rm8zUcxb3Isa'),
    RedisStore = require('connect-redis')(express),
    redis = require('redis'),
    auth = require('connect-auth'),
    scraper = require('./lib/scraper'),
    settings = require('./settings.js'),
    http = require('http');

var app = module.exports = express.createServer();
var port;
var db = redis.createClient();
db.del('namespaces', redis.print);

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
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function(){
  app.use(auth([auth.Twitter({
    consumerKey: settings.consumer_key,
    consumerSecret: settings.consumer_secret,
    callback: 'http://localhost:3000/signin'
  })]));
  app.use(app.router);
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true })); 
  port = 3000;
});

app.configure('production', function(){
  app.use(auth([auth.Twitter({
    consumerKey: settings.consumer_key,
    consumerSecret: settings.consumer_secret,
    callback: 'http://mesolabs.no.de/signin'
  })]));
  app.use(app.router);
  app.use(express.errorHandler());
  port = 80;
});

// Routes
const TITLE = 'Stalkr';

app.get('/', function(req, res){
  if (!req.isAuthenticated()) {
    res.render('index', {
      title: TITLE,
      authenticated: false
    });
  } else {
    http.get({
      host: 'api.twitter.com',
      port: 80,
      path: '/1/users/profile_image/' + req.getAuthDetails().user.username + '.json'
    }, function(twres) {
      var profileUrl = twres.headers.location;
      var user = {
        id:   req.getAuthDetails().user.user_id,
        name: req.getAuthDetails().user.username,
        access_token: req.getAuthDetails()['twitter_oauth_token'],
        access_token_secret: req.getAuthDetails()['twitter_oauth_token_secret'],
        profile_url: profileUrl
      };
      db.set(user.name, JSON.stringify(user), redis.print);
      db.set(user.id, JSON.stringify(user), redis.print);
      res.render('authok', {
        title: TITLE,
        authenticated: true,
        name: user.name
      });
    });
  }
});

app.get('/signin', function(req, res) {
  if (req.query.denied) {
    res.render('authng', {
      title: TITLE,
      authenticated: false
    });
  } else {
    req.authenticate(['twitter'], function(err, authenticated) {
      if (err) return console.log('Authenticate Error: ' + err);
      if (authenticated) {
        res.redirect('/', 303);
      }
    });
  }
});

app.get('/logout', function(req, res) {
  req.logout();
  res.redirect('/', 303);
});

app.get('/:name', function(req, res) {
  if (!req.isAuthenticated()) {
    res.redirect('/', 303);
    return;
  }
  db.get(req.params.name, function(err, value) {
    if (err) return console.log('Redis Error: ' + err);
    if (value) {
      var userId = (JSON.parse(value)).id;
      addChannel(userId);
      res.render('individual', {
        title: TITLE,
        authenticated: true,
        name: req.params.name,
        userId: userId
      });
    } else {
      res.render('lethimknow', {
        title: TITLE,
        authenticated: true,
        name: req.params.name,
        userId: userId
      });
    }
  });
});

var ee = new events.EventEmitter();
app.post('/', function(req, res) {
  var userId = req.body.userId;
  var url = req.body.url;
  if (url.lastIndexOf('http') !== 0) return res.send(200);
  scraper(url, function(err, $) {
    if (err) return console.log('Scraping Error:' + err);
    var title = $('title').text().trim();
    if (title) {
      url = decodeURIComponent(url);
      console.log(userId + ": " + title + "(" + url + ")");
      db.get(userId, function(err, value) {
        if (err) return console.log('Redis Error: ' + err);
        if (value) {
          var user = JSON.parse(value);
          var data = {
            user: user,
            url: url,
            title: title
          };
          saveCache(userId, data);
          saveCache('_all', data);
          ee.emit(userId, data);
          ee.emit('_all', data);
        }
      });
    }
  });
  res.send(200);
});

function saveCache(namespace, data) {
  db.llen(namespace, function(err, len) {
    if (err) return console.log('Redis Error: ' + err);
    if (len >= 30) {
      db.lpop(namespace, redis.print);
    }
    db.rpush(namespace, JSON.stringify(data), redis.print);
  });
}

app.listen(port);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);

var io = socketio.listen(app);
io.set('polling duration', 30 * 60);
io.set('close timeout', 30 * 60);
function addChannel(namespace) {
  db.sismember('namespaces', namespace, function(err, value) {
    if (err) throw err;
    if (value === 1) return;
    io.of('/' + namespace).on('connection', function(socket) {
      db.lrange(namespace, 0, 29, function(err, value) {
        if (err) return console.log('Redis Error: ' + err);
        console.log(value);
        value.forEach(function(element, index, array) {
          socket.emit('access', JSON.parse(element));
        });
      });
      ee.on(namespace, function(data) {
        socket.emit('access', data);
      });
    });
    db.sadd('namespaces', namespace, redis.print);
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
