import { io } from 'socket.io-client';

let socket;

export const initializeSocket = () => {
  if (!socket) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const socketUrl = `${protocol}//${host}`;
    
    socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000
    });
    
    socket.on('connect', () => {
      console.log('WebSocket connected');
    });
    
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
    
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
  }
  
  return socket;
};

export const joinInstructorRoom = (data = null) => {
  if (socket) {
    socket.emit('join-instructor-room', data);
  } else {
    console.warn('Cannot join room: socket not initialized');
  }
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;
