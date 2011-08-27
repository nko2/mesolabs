
/**
 * Module dependencies.
 */

var express = require('express'),
    nko = require('nko')('sWq0rm8zUcxb3Isa'),
    RedisStore = require('connect-redis')(express),
    auth = require('connect-auth'),
    scraper = require('./lib/scraper'),
    settings = require('./settings.js'),
    User = require('./lib/user.js');

var app = module.exports = express.createServer();
var port;
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
  app.use(auth[auth.Twitter({
    consumerKey: settings.consumer_key,
    consumerSecret: settings.consumer_secret,
    callback: 'http://mesolabs.no.de/signin'
  })]);
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
    var user = new User(
      req.getAuthDetails().user.user_id,
      req.getAuthDetails().user.username,
      req.getAuthDetails()['twitter_oauth_token'],
      req.getAuthDetails()['twitter_oauth_token_secret']
    );
    console.dir(user);
    res.render('authok', {
      title: TITLE,
      authenticated: true,
      name: user.name
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
      if (err) return console.log(err);
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

app.post('/', function(req, res) {
  var userId = req.body.userId;
  var url = req.body.url;
  console.log(userId + ": " + url);
  scraper(url, function(err, $) {
    if (err) return console.log('ERROR:' + err);
    console.log($('title').text().trim());
  });
  res.send(200);
});

app.listen(port);
console.log("Express server listening on port %d in %s mode", app.address().port, app.settings.env);
