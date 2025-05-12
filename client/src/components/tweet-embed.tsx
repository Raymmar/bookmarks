import { Tweet } from 'react-tweet';
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TweetEmbedProps {
  tweetUrl: string;
  className?: string;
}

/**
 * TweetEmbed component that renders an embedded tweet using the react-tweet library
 * It accepts a full tweet URL and extracts the tweet ID to render the embed
 */
export const TweetEmbed = ({ tweetUrl, className }: TweetEmbedProps) => {
  // Extract the tweet ID from the URL
  const extractTweetId = (url: string): string | null => {
    try {
      // Handle both twitter.com and x.com URLs
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'twitter.com' && urlObj.hostname !== 'x.com') {
        return null;
      }
      
      // The tweet ID is the last segment of the path in a tweet URL
      // e.g., https://twitter.com/username/status/1234567890123456789
      // or https://x.com/username/status/1234567890123456789
      const pathSegments = urlObj.pathname.split('/');
      if (pathSegments.length >= 4 && pathSegments[2] === 'status') {
        return pathSegments[3];
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting tweet ID:', error);
      return null;
    }
  };

  const tweetId = extractTweetId(tweetUrl);
  
  if (!tweetId) {
    // If we couldn't extract a tweet ID, show an error message
    return (
      <div className={className}>
        <div className="bg-red-50 p-4 rounded-md text-red-600">
          Invalid tweet URL: {tweetUrl}
        </div>
      </div>
    );
  }

  return (
    // We'll handle styling via CSS by targeting the data-tweet-id attribute
    <div className={className}>
      <Tweet 
        id={tweetId}
        fallback={
          <div className="flex flex-col space-y-3 animate-pulse p-4">
            <div className="flex items-center space-x-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-24 w-full rounded-md" />
            <div className="flex space-x-4">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-8" />
            </div>
          </div>
        }
      />
    </div>
  );
};

export default TweetEmbed;