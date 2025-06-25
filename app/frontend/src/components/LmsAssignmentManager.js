import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import useLmsApi from '../api/useLmsApi';
import { toast } from './ui/use-toast';

const LmsAssignmentManager = ({ examId, classId }) => {
  const {
    getClassLmsIntegration,
    getLmsAssignments,
    storeExamLmsAssignment,
    getExamLmsAssignment,
    exportGradesToLms,
    exportSubmissionsToLms
  } = useLmsApi();
  
  const [loading, setLoading] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [integration, setIntegration] = useState(null);
  const [assignmentId, setAssignmentId] = useState('');
  const [exportResults, setExportResults] = useState(null);

  useEffect(() => {
    loadData();
  }, [examId, classId]);

  const loadData = async () => {
    // Check if class has LMS integration
    const integrationResult = await getClassLmsIntegration(classId);
    if (integrationResult.success) {
      setIntegration(integrationResult.data);
      
      // Load assignments from LMS
      const assignmentsResult = await getLmsAssignments(classId);
      if (assignmentsResult.success) {
        setAssignments(assignmentsResult.data);
      } else {
        console.error('Error loading assignments:', assignmentsResult.error);
      }
      
      // Check if exam already has assignment linked
      const examAssignmentResult = await getExamLmsAssignment(examId);
      if (examAssignmentResult.success) {
        setAssignment(examAssignmentResult.data);
        setAssignmentId(examAssignmentResult.data.lmsAssignmentId);
      } else if (!examAssignmentResult.notFound) {
        console.error('Error loading exam assignment:', examAssignmentResult.error);
      }
    } else if (!integrationResult.notFound) {
      console.error('Error loading LMS integration:', integrationResult.error);
      toast({
        title: "Error",
        description: "Failed to load LMS integration data",
        variant: "destructive"
      });
    }
  };

  const handleLinkAssignment = async () => {
    if (!assignmentId) {
      toast({
        title: "Error",
        description: "Please select an assignment",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    const result = await storeExamLmsAssignment(examId, assignmentId);
    
    if (result.success) {
      toast({
        title: "Success",
        description: "Exam linked to assignment successfully"
      });
      loadData();
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to link assignment",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleExportGrades = async () => {
    setLoading(true);
    const result = await exportGradesToLms(examId);
    
    if (result.success) {
      setExportResults(result.data);
      toast({
        title: "Success",
        description: `Grades exported successfully! ${result.data.successCount} succeeded, ${result.data.failureCount} failed.`
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to export grades",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleExportSubmissions = async () => {
    setLoading(true);
    const result = await exportSubmissionsToLms(examId);
    
    if (result.success) {
      setExportResults(result.data);
      toast({
        title: "Success",
        description: `Submissions exported successfully! ${result.data.successCount} succeeded, ${result.data.failureCount} failed.`
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to export submissions",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  if (!integration) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>LMS Integration</CardTitle>
          <CardDescription>Canvas integration not configured</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              Please configure Canvas integration for this class to export grades and submissions.
            </AlertDescription>
          </Alert>
          <Button 
            className="mt-4" 
            onClick={() => window.open(`/ClassManagement/${classId}/lms`, '_blank')}
          >
            Configure LMS Integration
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Canvas Integration</CardTitle>
        <CardDescription>
          Export grades and submissions to Canvas
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Assignment Linking */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Canvas Assignment</Label>
            {assignment && (
              <Badge variant="secondary">Linked</Badge>
            )}
          </div>
          
          {assignment ? (
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-sm">
                <strong>Linked Assignment ID:</strong> {assignment.lmsAssignmentId}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                This exam is linked to a Canvas assignment
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Select value={assignmentId} onValueChange={setAssignmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Canvas assignment" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((assignment) => (
                    <SelectItem key={assignment.id} value={assignment.id.toString()}>
                      {assignment.name} ({assignment.pointsPossible} pts)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleLinkAssignment} disabled={loading || !assignmentId}>
                Link Assignment
              </Button>
            </div>
          )}
        </div>

        {assignment && (
          <>
            <Separator />
            
            {/* Export Actions */}
            <div className="space-y-3">
              <Label>Export to Canvas</Label>
              <div className="flex gap-2">
                <Button onClick={handleExportGrades} disabled={loading}>
                  {loading ? 'Exporting...' : 'Export Grades'}
                </Button>
                <Button onClick={handleExportSubmissions} disabled={loading} variant="outline">
                  {loading ? 'Exporting...' : 'Export Submissions'}
                </Button>
              </div>
            </div>

            {/* Export Results */}
            {exportResults && (
              <Alert>
                <AlertDescription>
                  <strong>Last Export:</strong> {exportResults.successCount} successful, {exportResults.failureCount} failed
                  {exportResults.failureCount > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-red-600">View failures</summary>
                      <ul className="mt-1 text-sm">
                        {exportResults.failed.map((failure, index) => (
                          <li key={index}>Student {failure.student_id}: {failure.error}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default LmsAssignmentManager;