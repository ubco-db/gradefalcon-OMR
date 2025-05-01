import React, { useEffect } from 'react';
import { useAuth0 } from "@auth0/auth0-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "./ui/use-toast";
import { initializeSocket, joinInstructorRoom } from "../utils/socketService";
import { Button } from "./ui/button";

/**
 * Provider component that handles real-time notifications for grade appeals
 * This component establishes a WebSocket connection and listens for grade appeal events
 * It should be placed high in the component tree to provide notifications across all pages
 */
const RealtimeNotificationProvider = ({ children }) => {
  const { user } = useAuth0();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Initialize socket connection
    const socket = initializeSocket();
    
    // Set up event handlers when socket connects
    socket.on('connect', () => {
      // Join instructor-specific room using Auth0 user ID
      if (user?.sub) {
        joinInstructorRoom({ instructorId: user.sub });
      } else {
        joinInstructorRoom();
      }
    });
    
    // Handle grade appeal notifications
    socket.on('new-grade-appeal', (data) => {
      toast({
        title: "New Grade Appeal",
        description: `${data.studentName} submitted a grade appeal for ${data.examTitle}`,
        // No duration means it will stay until manually closed
        action: (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate(`/ReplyAppeal/${data.gradeAppealId}`)}
          >
            View
          </Button>
        ),
      });
    });
    
    // Handle connection errors
    socket.on('connect_error', (error) => {
      // Try to reconnect after a delay
      setTimeout(() => socket.connect(), 5000);
    });
    
    // Clean up on unmount
    return () => {
      socket.off('connect');
      socket.off('new-grade-appeal');
      socket.off('connect_error');
      socket.off('reconnect');
    };
  }, [toast, navigate, user]);

  // Simply render children - this component only provides the notification functionality
  return children;
};

export default RealtimeNotificationProvider;
