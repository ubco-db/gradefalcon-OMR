import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import useLmsApi from '../api/useLmsApi';
import useExamApi from '../api/useExamApi';
import { toast } from './ui/use-toast';

const LmsAssignmentManager = ({ examId, classId }) => {
  const {
    getClassLmsIntegration,
    getLmsAssignments,
    createLmsAssignment,
    storeExamLmsAssignment,
    getExamLmsAssignment,
    removeExamLmsAssignment,
    exportGradesToLms,
    exportSubmissionsToLms
  } = useLmsApi();
  
  const { fetchExamDetails } = useExamApi();
  
  const [loading, setLoading] = useState(false);
  const [assignment, setAssignment] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [integration, setIntegration] = useState(null);
  const [assignmentId, setAssignmentId] = useState('');
  const [exportResults, setExportResults] = useState(null);
  
  // New assignment creation state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [examTitle, setExamTitle] = useState('');
  const [newAssignment, setNewAssignment] = useState({
    name: '',
    points_possible: '',
    due_at: '',
    description: ''
  });

  useEffect(() => {
    loadData();
  }, [examId, classId]);

  const loadData = async () => {
    // Fetch exam details to get exam title
    const examResult = await fetchExamDetails(examId);
    console.log('Exam details result:', examResult); // Debug log
    
    if (examResult.success && examResult.data && examResult.data.exam_title) {
      setExamTitle(examResult.data.exam_title);
      console.log('Exam title loaded:', examResult.data.exam_title); // Debug log
    } else {
      console.error('Failed to load exam details:', examResult.error || 'No exam title found');
    }
    
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

  const handleUnlinkAssignment = async () => {
    setLoading(true);
    const result = await removeExamLmsAssignment(examId);
    
    if (result.success) {
      toast({
        title: "Success",
        description: "Assignment unlinked successfully"
      });
      setAssignment(null);
      setAssignmentId('');
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to unlink assignment",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleCreateAssignment = async () => {
    if (!newAssignment.name || !newAssignment.points_possible) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    const result = await createLmsAssignment(classId, newAssignment);
    
    if (result.success) {
      toast({
        title: "Success",
        description: `Assignment "${newAssignment.name}" created successfully`
      });
      
      // Reset form
      setNewAssignment({
        name: '',
        points_possible: '',
        due_at: '',
        description: ''
      });
      setShowCreateForm(false);
      
      // Refresh assignments list
      await loadData();
      
      // Auto-select the new assignment
      setAssignmentId(result.data.id.toString());
      
      // Auto-link the new assignment
      const linkResult = await storeExamLmsAssignment(examId, result.data.id.toString());
      if (linkResult.success) {
        toast({
          title: "Success",
          description: "Assignment linked to exam successfully"
        });
        await loadData();
      }
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to create assignment",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleAssignmentChange = (value) => {
    if (value === 'create-new') {
      setShowCreateForm(true);
      setAssignmentId('');
      // Pre-populate assignment name with exam title
      console.log('Pre-populating assignment name with exam title:', examTitle); // Debug log
      setNewAssignment(prev => ({
        ...prev,
        name: examTitle || ''
      }));
    } else {
      setAssignmentId(value);
      setShowCreateForm(false);
    }
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
                <strong>Linked Assignment:</strong> {(() => {
                  const linkedAssignment = assignments.find(a => a.id.toString() === assignment.lmsAssignmentId);
                  return linkedAssignment 
                    ? `${linkedAssignment.name} (ID: ${assignment.lmsAssignmentId})`
                    : `ID: ${assignment.lmsAssignmentId}`;
                })()}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                This exam is linked to a Canvas assignment
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAssignment(null)}
                  disabled={loading}
                >
                  Relink Assignment
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleUnlinkAssignment}
                  disabled={loading}
                >
                  Unlink Assignment
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Select value={assignmentId} onValueChange={handleAssignmentChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Canvas assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create-new">+ Create New Assignment...</SelectItem>
                  {assignments.map((assignment) => (
                    <SelectItem key={assignment.id} value={assignment.id.toString()}>
                      {assignment.name} ({assignment.pointsPossible} pts)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {showCreateForm && (
                <div className="p-4 border rounded-md bg-gray-50 space-y-3">
                  <div>
                    <Label htmlFor="assignment-name">Assignment Name *</Label>
                    <Input
                      id="assignment-name"
                      value={newAssignment.name}
                      onChange={(e) => setNewAssignment({...newAssignment, name: e.target.value})}
                      placeholder="Enter assignment name"
                      disabled={loading}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="assignment-points">Points Possible *</Label>
                    <Input
                      id="assignment-points"
                      type="number"
                      value={newAssignment.points_possible}
                      onChange={(e) => setNewAssignment({...newAssignment, points_possible: e.target.value})}
                      placeholder="Enter points possible"
                      disabled={loading}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="assignment-due">Due Date (optional)</Label>
                    <Input
                      id="assignment-due"
                      type="datetime-local"
                      value={newAssignment.due_at}
                      onChange={(e) => setNewAssignment({...newAssignment, due_at: e.target.value})}
                      disabled={loading}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="assignment-description">Description (optional)</Label>
                    <Textarea
                      id="assignment-description"
                      value={newAssignment.description}
                      onChange={(e) => setNewAssignment({...newAssignment, description: e.target.value})}
                      placeholder="Enter assignment description"
                      disabled={loading}
                      rows={3}
                    />
                  </div>
                  
                  <div className="flex gap-2">
                    <Button onClick={handleCreateAssignment} disabled={loading}>
                      {loading ? 'Creating...' : 'Create & Link Assignment'}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setShowCreateForm(false);
                        setAssignmentId('');
                      }}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              
              {!showCreateForm && assignmentId && (
                <Button onClick={handleLinkAssignment} disabled={loading || !assignmentId}>
                  Link Assignment
                </Button>
              )}
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