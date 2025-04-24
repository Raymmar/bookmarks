import { useState, useEffect } from "react";
import { Loader2, AlertCircle, Image as ImageIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface MediaDisplayProps {
  bookmarkId: string;
  mediaUrls: string[];
}

/**
 * Component to display processed media images from a bookmark
 * Uses our API to fetch base64-processed versions of the original media URLs
 */
export function MediaDisplay({ bookmarkId, mediaUrls }: MediaDisplayProps) {
  const [processedImages, setProcessedImages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchProcessedImages = async () => {
      if (!bookmarkId) return;

      try {
        setIsLoading(true);
        setError(null);

        // Fetch processed images from our API
        const result = await apiRequest('GET', `/api/bookmarks/${bookmarkId}/processed-images`);
        
        if (result && result.images && Array.isArray(result.images)) {
          setProcessedImages(result.images);
          
          // Log success info
          console.log(`Retrieved ${result.images.length} processed images for bookmark ${bookmarkId}`);
          if (result.successCount !== result.mediaCount) {
            console.warn(`Only ${result.successCount} of ${result.mediaCount} images were successfully processed`);
          }
        } else {
          setProcessedImages([]);
          console.log(`No processed images available for bookmark ${bookmarkId}`);
        }
      } catch (err) {
        console.error('Error fetching processed images:', err);
        setError('Failed to load images');
        toast({
          title: 'Error loading images',
          description: 'Could not load the processed images. The image processing service might be unavailable.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchProcessedImages();
  }, [bookmarkId, toast]);

  // Show loading spinner while images are being processed
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin mb-2" />
        <p className="text-sm">Processing images...</p>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-red-500">
        <AlertCircle className="h-6 w-6 mb-2" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // If we have processed images, display them
  if (processedImages.length > 0) {
    return (
      <div className="grid grid-cols-1 gap-3">
        {processedImages.map((imageData, index) => (
          <div key={index} className="rounded-lg overflow-hidden border border-gray-200">
            <img 
              src={imageData} 
              alt={`Tweet media ${index + 1}`} 
              className="w-full h-auto max-h-96 object-contain bg-gray-50"
            />
          </div>
        ))}
      </div>
    );
  }

  // If no processed images but we have media URLs, show URLs as links
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{mediaUrls.length} media item(s) available but not processed</span>
        <ImageIcon className="h-4 w-4 text-gray-400" />
      </div>
      {mediaUrls.map((url, index) => (
        <a 
          key={index} 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="block mb-2 overflow-hidden rounded-lg border border-gray-200"
        >
          <div className="bg-gray-50 p-3 text-sm text-primary hover:underline truncate">
            {url}
          </div>
        </a>
      ))}
    </div>
  );
}