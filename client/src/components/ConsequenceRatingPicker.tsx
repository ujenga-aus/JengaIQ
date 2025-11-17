import { useQuery } from "@tanstack/react-query";
import { useProject } from "@/contexts/ProjectContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

interface ConsequenceRatingPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (typeId: string, level: number) => void;
  currentTypeId?: string;
  currentLevel?: number;
}

interface ConsequenceRating {
  id: string;
  consequenceTypeId: string;
  level: number;
  description: string;
  numericValue: number | null;
  typeName: string;
  isDefault: boolean;
}

interface ConsequenceType {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  displayOrder: number;
}

export function ConsequenceRatingPicker({
  open,
  onOpenChange,
  onSelect,
  currentTypeId,
  currentLevel,
}: ConsequenceRatingPickerProps) {
  const { selectedProject } = useProject();

  const { data: types, isLoading: typesLoading } = useQuery<ConsequenceType[]>({
    queryKey: ["/api/projects", selectedProject?.id, "consequence-types"],
    enabled: !!selectedProject && open,
  });

  const { data: ratings, isLoading: ratingsLoading } = useQuery<ConsequenceRating[]>({
    queryKey: ["/api/projects", selectedProject?.id, "consequence-ratings"],
    enabled: !!selectedProject && open,
  });

  const isLoading = typesLoading || ratingsLoading;

  // Group ratings by type and level
  const ratingsByTypeAndLevel = ratings?.reduce((acc, rating) => {
    const key = `${rating.consequenceTypeId}-${rating.level}`;
    acc[key] = rating;
    return acc;
  }, {} as Record<string, ConsequenceRating>);

  const handleCellClick = (typeId: string, level: number) => {
    onSelect(typeId, level);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Consequence Rating</DialogTitle>
          <DialogDescription>
            Choose a consequence type and level from the matrix below
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left font-semibold min-w-[80px]">Level</th>
                  {types?.map((type) => (
                    <th key={type.id} className="border p-2 text-left font-semibold">
                      {type.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[6, 5, 4, 3, 2, 1].map((level) => (
                  <tr key={level}>
                    <td className="border p-2 text-center font-semibold bg-muted">
                      {level}
                    </td>
                    {types?.map((type) => {
                      const rating = ratingsByTypeAndLevel?.[`${type.id}-${level}`];
                      const isSelected = currentTypeId === type.id && currentLevel === level;
                      
                      return (
                        <td
                          key={type.id}
                          className={`border p-2 cursor-pointer transition-colors hover-elevate active-elevate-2 ${
                            isSelected 
                              ? "bg-primary/20 border-primary border-2" 
                              : "bg-background"
                          }`}
                          onClick={() => handleCellClick(type.id, level)}
                          data-testid={`consequence-cell-${type.name}-${level}`}
                        >
                          <div className="text-sm whitespace-pre-wrap">
                            {rating?.description || "-"}
                          </div>
                          {rating?.numericValue != null && (
                            <div className="text-xs text-muted-foreground mt-1">
                              ${rating.numericValue.toLocaleString()}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
