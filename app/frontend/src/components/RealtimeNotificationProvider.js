import React, { useEffect } from 'react';
import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "./ui/use-toast";
import { initializeSocket, joinInstructorRoom } from "../utils/socketService";
import { Button } from "./ui/button";

const RealtimeNotificationProvider = ({ children }) => {
  const { user } = useAuth0();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Initialize socket connection and set up listeners
  useEffect(() => {
    console.log('Setting up global socket connection for real-time notifications...');
    const socket = initializeSocket();
    
    // Wait for connection before joining room
    socket.on('connect', () => {
      console.log('Socket connected, joining instructor room...');
      
      // Join instructor-specific room using Auth0 user ID
      if (user && user.sub) {
        // The Auth0 user ID is in the 'sub' field
        const instructorId = user.sub;
        console.log('Joining instructor-specific room with ID:', instructorId);
        joinInstructorRoom({ instructorId });
      } else {
        // Fallback to general room if no user ID available
        joinInstructorRoom();
      }
    });
    
    // Listen for new grade appeal notifications
    socket.on('new-grade-appeal', (data) => {
      console.log('New real-time grade appeal notification received:', data);
      
      // Show persistent toast notification (no auto-dismiss)
      toast({
        title: "New Grade Appeal",
        description: `${data.studentName} submitted a grade appeal for ${data.examTitle}`,
        // No duration means it will stay until manually closed
        action: (
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate(`/ReplyAppeal/${data.gradeAppealId}`)}
            >
              View
            </Button>
          </div>
        ),
      });
    });
    
    // Add a connection error handler
    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      
      // Try to reconnect after a delay
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        socket.connect();
      }, 5000);
    });
    
    // Handle reconnection
    socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
    });
    
    // Clean up on unmount
    return () => {
      console.log('Cleaning up socket listeners...');
      socket.off('connect');
      socket.off('new-grade-appeal');
      socket.off('connect_error');
      socket.off('reconnect');
      // Don't disconnect the socket here to keep it alive for other components
    };
  }, [toast, navigate, user]);

  return children;
};

export default RealtimeNotificationProvider;
