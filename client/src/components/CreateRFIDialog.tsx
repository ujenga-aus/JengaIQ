import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Plus, Upload, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export function CreateRFIDialog() {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newPhotos = Array.from(e.target.files).map(file => URL.createObjectURL(file));
      setPhotos([...photos, ...newPhotos]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-rfi">
          <Plus className="h-4 w-4 mr-2" />
          Create RFI
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New RFI</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); console.log('RFI created'); setOpen(false); }}>
          <div className="space-y-2">
            <Label htmlFor="rfi-to">To (Recipient)</Label>
            <Input id="rfi-to" placeholder="Enter recipient name or email" data-testid="input-rfi-to" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rfi-subject">Subject / Title</Label>
            <Input id="rfi-subject" placeholder="Brief description of the RFI" data-testid="input-rfi-subject" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rfi-description">Detailed Description</Label>
            <Textarea 
              id="rfi-description" 
              placeholder="Describe the question or issue in detail..." 
              rows={4}
              data-testid="textarea-rfi-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rfi-references">Drawing / Spec References</Label>
            <Input id="rfi-references" placeholder="e.g., Drawing A-101, Spec Section 3.4" data-testid="input-rfi-references" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rfi-resolution">Proposed Resolution</Label>
            <Textarea 
              id="rfi-resolution" 
              placeholder="Suggest a possible solution or approach..." 
              rows={3}
              data-testid="textarea-rfi-resolution"
            />
          </div>

          <div className="space-y-2">
            <Label>Impacted Areas</Label>
            <div className="flex flex-wrap gap-4">
              {["Program", "Cost", "Safety", "Quality"].map((area) => (
                <div key={area} className="flex items-center gap-2">
                  <Checkbox id={`impact-${area}`} data-testid={`checkbox-impact-${area.toLowerCase()}`} />
                  <label htmlFor={`impact-${area}`} className="text-sm cursor-pointer">{area}</label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rfi-date">Required Response Date</Label>
            <Input id="rfi-date" type="date" data-testid="input-rfi-date" />
          </div>

          <div className="space-y-2">
            <Label>Photo Attachments</Label>
            <div className="border-2 border-dashed rounded-lg p-4 space-y-3">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById('photo-upload')?.click()} data-testid="button-upload-photo">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Photos
                </Button>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img src={photo} alt={`Upload ${index + 1}`} className="w-full h-24 object-cover rounded" />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removePhoto(index)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-rfi">
              Cancel
            </Button>
            <Button type="submit" data-testid="button-submit-rfi">
              Create RFI
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
