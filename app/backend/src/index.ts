import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

const app = require("./server");
const { port } = require("./config");

// Create HTTP server
const server = createServer(app);

// Initialize Socket.io
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
  },
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

interface SocketData {
  instructorId?: string;
  examId?: string;
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Join instructor-specific room
  socket.on('join-instructor-room', (data: SocketData) => {
    if (data?.instructorId) {
      const instructorRoom = `instructor-${data.instructorId}`;
      socket.join(instructorRoom);
      console.log(`Instructor joined room: ${instructorRoom}`);
    } else {
      socket.join('instructors');
    }
  });
  
  // Join exam-specific room
  socket.on('join-exam-room', (data: SocketData) => {
    if (data?.examId) {
      const roomName = `exam-${data.examId}`;
      socket.join(roomName);
      console.log(`User joined exam room: ${roomName}`);
    }
  });
  
  // Leave exam-specific room
  socket.on('leave-exam-room', (data: SocketData) => {
    if (data?.examId) {
      const roomName = `exam-${data.examId}`;
      socket.leave(roomName);
      console.log(`User left exam room: ${roomName}`);
    }
  });
  
  socket.on('disconnect', (reason: string) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
  });
});

// Make io accessible from other modules
app.io = io;

// Start the server
server.listen(port, () => {
  console.log(`Webserver is ready on port ${port}`);
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

// Handle Docker signals properly
process.on("SIGINT", () => {
  console.info(
    "Got SIGINT (aka ctrl-c in docker). Graceful shutdown ",
    new Date().toISOString()
  );
  shutdown();
});

process.on("SIGTERM", () => {
  console.info(
    "Got SIGTERM (docker container stop). Graceful shutdown ",
    new Date().toISOString()
  );
  shutdown();
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught Exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled Rejection:', reason);
  shutdown();
});

// shut down server
const shutdown = (): void => {
  server.close((err?: Error) => {
    if (err) {
      console.error('Error during server shutdown:', err);
      process.exit(1);
    }
    console.log('Server closed successfully');
    process.exit(0);
  });
};
//
// need above in docker container to properly exit
//
