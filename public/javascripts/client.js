var userId = '= userId';
var socket = io.connect('http://localhost:3000/' + userId);
socket.on('access', function(data) {
});

