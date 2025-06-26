import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogClose } from '../../components/ui/dialog';
import useLmsApi from '../../api/useLmsApi';
import { toast } from '../../components/ui/use-toast';

const LmsIntegration = () => {
  const { classId } = useParams();
  const navigate = useNavigate();
  const {
    getClassLmsIntegration,
    storeClassLmsIntegration,
    removeClassLmsIntegration,
    validateClassLmsIntegration,
    getAvailableLmsTypes
  } = useLmsApi();
  
  const [loading, setLoading] = useState(false);
  const [integration, setIntegration] = useState(null);
  const [availableLmsTypes, setAvailableLmsTypes] = useState([]);
  const [formData, setFormData] = useState({
    lmsType: 'canvas',
    accessToken: '',
    lmsCourseId: ''
  });
  const [validation, setValidation] = useState(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);

  useEffect(() => {
    loadIntegration();
    loadAvailableLmsTypes();
  }, [classId]);

  const loadIntegration = async () => {
    const result = await getClassLmsIntegration(classId);
    if (result.success) {
      setIntegration(result.data);
      setFormData({
        lmsType: result.data.lmsType || 'canvas',
        accessToken: '********************', // Show asterisks for existing token
        lmsCourseId: result.data.lmsCourseId || ''
      });
    } else if (!result.notFound) {
      console.error('Error loading integration:', result.error);
    }
  };

  const loadAvailableLmsTypes = async () => {
    const result = await getAvailableLmsTypes();
    if (result.success) {
      setAvailableLmsTypes(result.data);
    } else {
      console.error('Error loading LMS types:', result.error);
      // Fallback to default options
      setAvailableLmsTypes([
        { id: 'canvas', name: 'Canvas' },
        { id: 'mocklms', name: 'Mock LMS (Testing)' }
      ]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // For existing integration, allow asterisks as placeholder
    const isExistingIntegration = integration && formData.accessToken === '********************';
    
    if ((!formData.accessToken || formData.accessToken.trim() === '') && !isExistingIntegration) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    if (!formData.lmsCourseId) {
      toast({
        title: "Error",
        description: "Please fill in the LMS Course ID",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    const result = await storeClassLmsIntegration(
      classId, 
      formData.lmsType, 
      formData.accessToken, 
      formData.lmsCourseId
    );
    
    if (result.success) {
      toast({
        title: "Success",
        description: "LMS integration configured successfully"
      });
      loadIntegration();
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to configure integration",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleValidate = async () => {
    setLoading(true);
    const result = await validateClassLmsIntegration(classId);
    
    if (result.success) {
      setValidation(result.data);
      toast({
        title: result.data.valid ? "Success" : "Error",
        description: result.data.valid ? "Integration is valid" : result.data.error,
        variant: result.data.valid ? "default" : "destructive"
      });
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to validate integration",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleRemoveClick = () => {
    setRemoveDialogOpen(true);
  };

  const handleConfirmRemove = async () => {
    setLoading(true);
    const result = await removeClassLmsIntegration(classId);
    
    if (result.success) {
      toast({
        title: "Success",
        description: "LMS integration removed successfully"
      });
      setIntegration(null);
      setFormData({ lmsType: 'canvas', accessToken: '', lmsCourseId: '' });
      setRemoveDialogOpen(false);
    } else {
      toast({
        title: "Error",
        description: result.error || "Failed to remove integration",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">LMS Integration</h1>
          <p className="text-gray-600">Configure Canvas integration for this class</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      <Tabs defaultValue="configure" className="space-y-4">
        <TabsList>
          <TabsTrigger value="configure">Configure</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
        </TabsList>

        <TabsContent value="configure">
          <Card>
            <CardHeader>
              <CardTitle>LMS Configuration</CardTitle>
              <CardDescription>
                Set up your Canvas integration to sync grades and submissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="lmsType">LMS Type</Label>
                  <Select 
                    value={formData.lmsType}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, lmsType: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLmsTypes.map((lmsType) => (
                        <SelectItem key={lmsType.id} value={lmsType.id}>
                          {lmsType.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="accessToken">Access Token *</Label>
                  <Input
                    id="accessToken"
                    type="password"
                    placeholder={`Enter your ${formData.lmsType === 'canvas' ? 'Canvas' : formData.lmsType.charAt(0).toUpperCase() + formData.lmsType.slice(1)} access token`}
                    value={formData.accessToken}
                    onChange={(e) => setFormData(prev => ({ ...prev, accessToken: e.target.value }))}
                    required
                  />
                  <p className="text-sm text-gray-500">
                    Generate this from Canvas → Account → Settings → New Access Token
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lmsCourseId">{formData.lmsType === 'canvas' ? 'Canvas' : formData.lmsType.charAt(0).toUpperCase() + formData.lmsType.slice(1)} Course ID *</Label>
                  <Input
                    id="lmsCourseId"
                    placeholder={`Enter ${formData.lmsType === 'canvas' ? 'Canvas' : formData.lmsType} course ID (e.g., 123456)`}
                    value={formData.lmsCourseId}
                    onChange={(e) => setFormData(prev => ({ ...prev, lmsCourseId: e.target.value }))}
                    required
                  />
                  <p className="text-sm text-gray-500">
                    {formData.lmsType === 'canvas' 
                      ? 'Find this in your Canvas course URL: /courses/[ID]' 
                      : `Find this in your ${formData.lmsType.charAt(0).toUpperCase() + formData.lmsType.slice(1)} course URL`}
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Saving...' : integration ? 'Update Integration' : 'Save Integration'}
                  </Button>
                  {integration && (
                    <>
                      <Button type="button" variant="outline" onClick={handleValidate} disabled={loading}>
                        Validate
                      </Button>
                      <Button type="button" variant="destructive" onClick={handleRemoveClick} disabled={loading}>
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="status">
          <Card>
            <CardHeader>
              <CardTitle>Integration Status</CardTitle>
              <CardDescription>
                Current status of your LMS integration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {integration ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Configured</Badge>
                    <span>LMS Type: {integration.lmsType}</span>
                  </div>
                  <div>
                    <span>Course ID: {integration.lmsCourseId}</span>
                  </div>
                  {validation && (
                    <Alert>
                      <AlertDescription>
                        Validation Status: {validation.valid ? '✅ Valid' : '❌ Invalid'}
                        {validation.error && ` - ${validation.error}`}
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <Alert>
                  <AlertDescription>
                    No LMS integration configured for this class.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Remove Confirmation Dialog */}
      <Dialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Remove LMS Integration</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this LMS integration? This will disconnect your class from Canvas and you'll need to reconfigure it later.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <DialogClose asChild>
              <Button variant="ghost" disabled={loading}>
                Cancel
              </Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleConfirmRemove} disabled={loading}>
              {loading ? 'Removing...' : 'Remove'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default LmsIntegration;