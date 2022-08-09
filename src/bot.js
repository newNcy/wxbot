
const net = require('net');

const server = net.createServer(socket => {
    socket.on('data', buffer => {
        console.log(buffer.toString('utf8'))
    });
})

server.listen(1224)
