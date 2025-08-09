import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "../../components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../components/ui/table";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "../../components/ui/dialog";
import NewClassForm from "../../components/NewClassForm";
import { MoreHorizontal } from "lucide-react";
import { useAuth0 } from "@auth0/auth0-react";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "../../components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { Label } from "../../components/ui/label";
import { CheckboxRed } from "../../components/ui/checkbox";

const Classes = () => {
  const { getAccessTokenSilently } = useAuth0();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("active");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(null);

  const fetchClasses = async () => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/class/classes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setClasses(data);
      } else {
        setError("Failed to fetch classes");
      }
    } catch (error) {
      setError("Error fetching classes");
    }
  };

  useEffect(() => {
    fetchClasses();
  }, []);

  const filteredClasses = classes.filter((classItem) => {
    if (filter === "all") return true;
    if (filter === "active") return classItem.active === null || classItem.active === true;
    if (filter === "archived") return classItem.active === false;
    return false;
  });

  const handleArchiveCourse = async (classId) => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`/api/class/archive-course`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ class_id: classId }),
      });

      if (!response.ok) {
        throw new Error("Failed to archive course");
      }

      fetchClasses();
    } catch (error) {
      console.error("Error archiving course:", error);
      setError("Error archiving course");
    }
  };

  const handleUnarchiveCourse = async (classId) => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`/api/class/unarchive-course`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ class_id: classId }),
      });

      if (!response.ok) {
        throw new Error("Failed to re-activate course");
      }

      fetchClasses();
    } catch (error) {
      console.error("Error re-activating course:", error);
      setError("Error re-activating course");
    }
  };

  const handleDeleteCourse = async (classId) => {
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch(`/api/class/delete-course`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ class_id: classId }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete course");
      }

      fetchClasses();
      setDialogOpen(false);
      setConfirmDelete(false);
    } catch (error) {
      console.error("Error deleting course:", error);
      setError("Error deleting course");
    }
  };

  return (
    <main className="flex flex-col gap-4 p-4">
      <div className="flex-1 flex flex-col max-w-full">
        <h1 className="text-3xl font-bold mb-4">Classes</h1>
        <Tabs value={filter} onValueChange={setFilter} className="w-full flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
          <TabsContent value={filter} className="flex-1 flex flex-col">
            <Card className="bg-white border rounded shadow-sm max-h-fit">
              <CardHeader className="px-6 py-4 border-b">
                <CardTitle className="text-lg font-semibold">
                  {filter === "active" && "Active Classes"}
                  {filter === "archived" && "Archived Classes"}
                  {filter === "all" && "All Classes"}
                </CardTitle>
                <CardDescription className="text-sm text-gray-600">
                  {filteredClasses.length} {filteredClasses.length === 1 ? 'class' : 'classes'} found
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-80 w-full">
                  <div className="px-6 py-2">
                    <Table>
                      <TableHeader className="sticky top-0 bg-white z-10">
                        <TableRow className="border-b">
                          <TableHead className="font-semibold">Class Name</TableHead>
                          <TableHead className="hidden sm:table-cell font-semibold">Course ID</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="hidden sm:table-cell font-semibold text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredClasses.length > 0 ? (
                          filteredClasses.map((classItem, index) => {
                            const status = classItem.active === null || classItem.active === true ? "Active" : "Archived";
                            const statusClass = classItem.active === null || classItem.active === true ? "text-green-600 border-green-600 bg-green-50" : "text-gray-500 border-gray-500 bg-gray-50";
                            return (
                              <TooltipProvider key={index}>
                                <Tooltip delayDuration={0}>
                                  <TooltipTrigger asChild>
                                    <TableRow className="hover:bg-gray-50 cursor-pointer transition-colors border-b">
                                      <TableCell 
                                        onClick={() => navigate(`/ClassManagement/${classItem.class_id}`)}
                                        className="py-4"
                                      >
                                        <div className="font-medium text-gray-900">{classItem.course_name}</div>
                                      </TableCell>
                                      <TableCell 
                                        className="hidden sm:table-cell py-4" 
                                        onClick={() => navigate(`/ClassManagement/${classItem.class_id}`)}
                                      >
                                        <div className="text-gray-700">{classItem.course_id}</div>
                                      </TableCell>
                                      <TableCell 
                                        onClick={() => navigate(`/ClassManagement/${classItem.class_id}`)}
                                        className="py-4"
                                      >
                                        <Badge variant="outline" className={`${statusClass} text-xs font-medium px-2 py-1`}>
                                          {status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="hidden sm:table-cell py-4">
                                        <div className="flex justify-end">
                                          <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-gray-100">
                                                <MoreHorizontal className="h-4 w-4" />
                                              </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                              {classItem.active ? (
                                                <DropdownMenuItem
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleArchiveCourse(classItem.class_id);
                                                  }}
                                                  className="text-sm"
                                                >
                                                  Archive Course
                                                </DropdownMenuItem>
                                              ) : (
                                                <DropdownMenuItem
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleUnarchiveCourse(classItem.class_id);
                                                  }}
                                                  className="text-sm"
                                                >
                                                  Re-activate Course
                                                </DropdownMenuItem>
                                              )}
                                              <DropdownMenuItem
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setSelectedClass(classItem);
                                                  setDialogOpen(true);
                                                }}
                                                className="text-sm text-red-600 focus:text-red-600"
                                              >
                                                Delete Course
                                              </DropdownMenuItem>
                                            </DropdownMenuContent>
                                          </DropdownMenu>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Click to view course details</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          })
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-12 text-gray-500">
                              <div className="flex flex-col items-center gap-2">
                                <div className="text-gray-400 text-4xl">📚</div>
                                <div>No classes found for the selected filter.</div>
                                <div className="text-sm">Create a new class to get started.</div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        
        <Card className="bg-white border rounded shadow-sm mt-6">
          <CardHeader className="flex justify-between px-6 py-4">
            <div>
              <CardTitle className="mb-2">Create a New Class</CardTitle>
              <CardDescription>Import a CSV file containing the student names and their student IDs in your class.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex-grow">
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm">Create Class</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <NewClassForm />
                <DialogClose asChild>
                  <Button variant="ghost">Close</Button>
                </DialogClose>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle>Delete Course</DialogTitle>
            <DialogDescription>
              {selectedClass && (
                <>
                  <p>Course Name: {selectedClass.course_name}</p>
                  <p>Course ID: {selectedClass.course_id}</p>
                  <p className="mt-4 text-red-600 font-bold">Warning: Deleting a course will delete all exams and classlists from this course.</p>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <CheckboxRed
                id="confirm-delete"
                checked={confirmDelete}
                onCheckedChange={setConfirmDelete}
              />
              <Label htmlFor="confirm-delete" className="text-red-600">
                I understand the consequences
              </Label>
            </div>
            <Button
              variant="destructive"
              disabled={!confirmDelete}
              onClick={() => handleDeleteCourse(selectedClass.class_id)}
            >
              Confirm
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
};

export default Classes;
