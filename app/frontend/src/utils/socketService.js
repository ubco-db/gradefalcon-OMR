import { io } from 'socket.io-client';

let socket;

export const initializeSocket = () => {
  if (!socket) {
    // Get the base URL from the current window location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    // In Docker, we need to use the backend service name or IP
    // For local development, we can use the same host
    // The backend API is already proxied in setupProxy.js, so we can use the same host
    const socketUrl = `${protocol}//${host}`;
    console.log('Socket URL:', socketUrl);
    
    // Create socket connection with explicit path and transports
    // Use polling as primary transport for better reliability in Docker
    socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['polling', 'websocket'], // Use polling first, then try websocket
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true,
      autoConnect: true
    });
    
    socket.on('connect', () => {
      console.log('Connected to WebSocket server');
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    
    socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });
  }
  
  return socket;
};

export const joinInstructorRoom = (data = null) => {
  if (socket) {
    socket.emit('join-instructor-room', data);
    if (data && data.instructorId) {
      console.log(`Joined instructor room with ID: ${data.instructorId}`);
    } else {
      console.log('Joined general instructor room');
    }
  } else {
    console.warn('Cannot join instructor room: socket not initialized');
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;
