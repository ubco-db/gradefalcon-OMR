const app = require("./server");
const { port } = require("./config");
const http = require('http');
const { Server } = require('socket.io');

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // In production, restrict this to your frontend domain
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  path: '/socket.io',
  transports: ['polling', 'websocket'], // Use polling first for better compatibility
  allowEIO3: true, // Allow Engine.IO v3 client (needed for some older clients)
  pingTimeout: 60000, // Increase ping timeout
  pingInterval: 25000, // Increase ping interval
  cookie: false // Disable cookies for better compatibility
});

// Log when server is ready
io.engine.on("connection_error", (err) => {
  console.log("Socket.io connection error:", err);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Join instructor-specific room when they connect
  socket.on('join-instructor-room', (data) => {
    if (data && data.instructorId) {
      const instructorRoom = `instructor-${data.instructorId}`;
      socket.join(instructorRoom);
      console.log(`Instructor ${socket.id} joined personal room ${instructorRoom}`);
    } else {
      // Fallback to general instructors room
      socket.join('instructors');
      console.log(`Instructor ${socket.id} joined general instructors room`);
    }
  });
  
  // Join exam-specific instructor room
  socket.on('join-exam-room', (data) => {
    if (data && data.examId) {
      const roomName = `exam-${data.examId}`;
      socket.join(roomName);
      console.log(`User ${socket.id} joined room ${roomName}`);
    }
  });
  
  // Leave exam-specific room
  socket.on('leave-exam-room', (data) => {
    if (data && data.examId) {
      const roomName = `exam-${data.examId}`;
      socket.leave(roomName);
      console.log(`User ${socket.id} left room ${roomName}`);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io accessible from other modules
app.io = io;

// Start the server
server.listen(port, function() {
  console.log("Webserver is ready");
});

//
// need this in docker container to properly exit since node doesn't handle SIGINT/SIGTERM
// this also won't work on using npm start since:
// https://github.com/npm/npm/issues/4603
// https://github.com/npm/npm/pull/10868
// https://github.com/RisingStack/kubernetes-graceful-shutdown-example/blob/master/src/index.js
// if you want to use npm then start with `docker run --init` to help, but I still don't think it's
// a graceful shutdown of node process
//

// quit on ctrl-c when running docker in terminal
process.on("SIGINT", function onSigint() {
  console.info(
    "Got SIGINT (aka ctrl-c in docker). Graceful shutdown ",
    new Date().toISOString()
  );
  shutdown();
});

// quit properly on docker stop
process.on("SIGTERM", function onSigterm() {
  console.info(
    "Got SIGTERM (docker container stop). Graceful shutdown ",
    new Date().toISOString()
  );
  shutdown();
});

// shut down server
function shutdown() {
  server.close(function onServerClosed(err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    process.exit(0);
  });
}
//
// need above in docker container to properly exit
//
