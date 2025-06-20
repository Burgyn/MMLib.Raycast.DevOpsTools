import {
  ActionPanel,
  Detail,
  List,
  Action,
  Icon,
  showToast,
  Toast,
  getPreferenceValues,
  LaunchProps,
  LocalStorage,
} from "@raycast/api";
import { useState, useEffect } from "react";
import { execSync } from "child_process";

interface Preferences {
  organization: string;
  project: string;
  repository: string;
}

interface PullRequest {
  pullRequestId: number;
  title: string;
  createdBy: {
    displayName: string;
    uniqueName: string;
  };
  creationDate: string;
  status: string;
  sourceRefName: string;
  targetRefName: string;
  description?: string;
  reviewers: Array<{
    displayName: string;
    vote: number;
  }>;
  url?: string;
}

interface CommandArguments {
  dayRange?: string;
}

const DAY_RANGES = [
  { value: "7", label: "Last 7 days" },
  { value: "14", label: "Last 14 days" },
  { value: "21", label: "Last 21 days" },
  { value: "31", label: "Last 31 days" },
];

interface ViewedPRs {
  [prId: string]: {
    viewedAt: string;
    prTitle: string;
  };
}

// Storage management
const VIEWED_PRS_KEY = "viewedPullRequests";
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000;

async function getViewedPRs(): Promise<ViewedPRs> {
  try {
    const stored = await LocalStorage.getItem<string>(VIEWED_PRS_KEY);
    if (!stored) return {};
    
    const viewedPRs = JSON.parse(stored) as ViewedPRs;
    
    // Clean up old entries (older than 1 month)
    const now = Date.now();
    const cleaned: ViewedPRs = {};
    
    Object.entries(viewedPRs).forEach(([prId, data]) => {
      const viewedDate = new Date(data.viewedAt).getTime();
      if (now - viewedDate < ONE_MONTH_MS) {
        cleaned[prId] = data;
      }
    });
    
    // Save cleaned data back
    await LocalStorage.setItem(VIEWED_PRS_KEY, JSON.stringify(cleaned));
    return cleaned;
  } catch {
    return {};
  }
}

async function markPRAsViewed(prId: number, prTitle: string): Promise<void> {
  try {
    const viewedPRs = await getViewedPRs();
    viewedPRs[prId.toString()] = {
      viewedAt: new Date().toISOString(),
      prTitle,
    };
    await LocalStorage.setItem(VIEWED_PRS_KEY, JSON.stringify(viewedPRs));
  } catch (error) {
    console.error("Error marking PR as viewed:", error);
  }
}

async function togglePRViewed(prId: number, prTitle: string, isCurrentlyViewed: boolean): Promise<void> {
  try {
    const viewedPRs = await getViewedPRs();
    
    if (isCurrentlyViewed) {
      // Remove from viewed
      delete viewedPRs[prId.toString()];
    } else {
      // Mark as viewed
      viewedPRs[prId.toString()] = {
        viewedAt: new Date().toISOString(),
        prTitle,
      };
    }
    
    await LocalStorage.setItem(VIEWED_PRS_KEY, JSON.stringify(viewedPRs));
  } catch (error) {
    console.error("Error toggling PR viewed status:", error);
  }
}

function getStatusEmoji(status: string): string {
  switch (status.toLowerCase()) {
    case "active":
      return "🔄";
    case "completed":
      return "✅";
    case "abandoned":
      return "❌";
    default:
      return "⚪";
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getVoteIcon(vote: number): string {
  if (vote > 0) return "✅";
  if (vote < 0) return "❌";
  return "⏳";
}

interface CachedPRData {
  data: PullRequest[];
  cachedAt: string;
  organization: string;
  project: string;
  repository: string;
  dayRange: number;
}

// Cache management
const CACHE_KEY_PREFIX = "pullRequestsCache";
const CACHE_EXPIRATION_MS = 2 * 60 * 60 * 1000; // 2 hours

function getCacheKey(organization: string, project: string, repository: string, dayRange: number): string {
  return `${CACHE_KEY_PREFIX}_${organization}_${project}_${repository}_${dayRange}`;
}

async function getCachedPRs(organization: string, project: string, repository: string, dayRange: number): Promise<PullRequest[] | null> {
  try {
    const cacheKey = getCacheKey(organization, project, repository, dayRange);
    const cached = await LocalStorage.getItem<string>(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const cachedData = JSON.parse(cached) as CachedPRData;
    const now = Date.now();
    const cachedTime = new Date(cachedData.cachedAt).getTime();
    
    // Check if cache is still valid (less than 2 hours old)
    if (now - cachedTime < CACHE_EXPIRATION_MS) {
      console.log(`Cache hit for ${organization}/${project}/${repository} (${dayRange} days)`);
      return cachedData.data;
    } else {
      console.log(`Cache expired for ${organization}/${project}/${repository} (${dayRange} days)`);
      // Remove expired cache
      await LocalStorage.removeItem(cacheKey);
      return null;
    }
  } catch (error) {
    console.error("Error reading cache:", error);
    return null;
  }
}

async function setCachedPRs(organization: string, project: string, repository: string, dayRange: number, data: PullRequest[]): Promise<void> {
  try {
    const cacheKey = getCacheKey(organization, project, repository, dayRange);
    const cacheData: CachedPRData = {
      data,
      cachedAt: new Date().toISOString(),
      organization,
      project,
      repository,
      dayRange,
    };
    
    await LocalStorage.setItem(cacheKey, JSON.stringify(cacheData));
    console.log(`Cached ${data.length} PRs for ${organization}/${project}/${repository} (${dayRange} days)`);
  } catch (error) {
    console.error("Error writing cache:", error);
  }
}

async function clearOldCaches(): Promise<void> {
  try {
    // Get all LocalStorage items
    const allItems = await LocalStorage.allItems();
    const now = Date.now();
    
    for (const [key, value] of Object.entries(allItems)) {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        try {
          const cachedData = JSON.parse(value as string) as CachedPRData;
          const cachedTime = new Date(cachedData.cachedAt).getTime();
          
          // Remove if older than expiration time
          if (now - cachedTime >= CACHE_EXPIRATION_MS) {
            await LocalStorage.removeItem(key);
            console.log(`Removed expired cache: ${key}`);
          }
        } catch {
          // If we can't parse it, remove it
          await LocalStorage.removeItem(key);
        }
      }
    }
  } catch (error) {
    console.error("Error clearing old caches:", error);
  }
}

async function fetchPullRequests(organization: string, project: string, repository: string, days: number): Promise<PullRequest[]> {
  try {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateString = sinceDate.toISOString().split('T')[0];

    // Try different possible paths for Azure CLI
    const possibleAzPaths = [
      '/opt/homebrew/bin/az',  // Homebrew on Apple Silicon
      '/usr/local/bin/az',     // Homebrew on Intel
      'az'                     // System PATH
    ];

    let azPath = 'az';
    
    // Check which az path exists and works
    for (const path of possibleAzPaths) {
      try {
        execSync(`${path} --version`, { stdio: "pipe" });
        azPath = path;
        break;
      } catch {
        continue;
      }
    }

    // Check if Azure CLI is logged in
    try {
      execSync(`${azPath} account show`, { stdio: "pipe" });
    } catch {
      throw new Error("Azure CLI is not logged in. Please run 'az login' first.");
    }

    const command = `${azPath} repos pr list --organization https://dev.azure.com/${organization} --project "${project}" --repository "${repository}" --status all --query "[?creationDate >= '${sinceDateString}']" --output json`;
    
    const result = execSync(command, { encoding: "utf8", stdio: "pipe" });
    const pullRequests = JSON.parse(result);

    return pullRequests.map((pr: {
      pullRequestId: number;
      title: string;
      createdBy: { displayName: string; uniqueName: string };
      creationDate: string;
      status: string;
      sourceRefName: string;
      targetRefName: string;
      description?: string;
      reviewers?: Array<{ displayName: string; vote: number }>;
    }) => ({
      pullRequestId: pr.pullRequestId,
      title: pr.title,
      createdBy: pr.createdBy,
      creationDate: pr.creationDate,
      status: pr.status,
      sourceRefName: pr.sourceRefName.replace("refs/heads/", ""),
      targetRefName: pr.targetRefName.replace("refs/heads/", ""),
      description: pr.description,
      reviewers: pr.reviewers || [],
      url: `https://dev.azure.com/${organization}/${project}/_git/${repository}/pullrequest/${pr.pullRequestId}`,
    }));
  } catch (error) {
    console.error("Error fetching pull requests:", error);
    throw error;
  }
}

// Enhanced fetchPullRequests with caching
async function fetchPullRequestsWithCache(organization: string, project: string, repository: string, days: number): Promise<PullRequest[]> {
  // Try to get from cache first
  const cachedData = await getCachedPRs(organization, project, repository, days);
  if (cachedData) {
    return cachedData;
  }
  
  // Cache miss - fetch from API
  console.log(`Cache miss - fetching from API: ${organization}/${project}/${repository} (${days} days)`);
  const freshData = await fetchPullRequests(organization, project, repository, days);
  
  // Cache the fresh data
  await setCachedPRs(organization, project, repository, days, freshData);
  
  return freshData;
}

function PullRequestDetail({ pr, onMarkViewed }: { pr: PullRequest; onMarkViewed: () => void }) {
  const reviewersSection = pr.reviewers.length > 0 
    ? `\n## Reviewers\n${pr.reviewers.map(r => `${getVoteIcon(r.vote)} ${r.displayName}`).join('\n')}`
    : '';

  const markdown = `
# ${getStatusEmoji(pr.status)} ${pr.title}

**Pull Request #${pr.pullRequestId}**

**Status:** ${pr.status}  
**Created by:** ${pr.createdBy.displayName}  
**Created:** ${formatDate(pr.creationDate)}  
**Source:** ${pr.sourceRefName} → ${pr.targetRefName}  

## Description
${pr.description || "No description provided"}
${reviewersSection}
  `;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action
            title="Mark as Viewed"
            icon={Icon.CheckCircle}
            onAction={onMarkViewed}
            shortcut={{ modifiers: ["cmd"], key: "m" }}
          />
          <Action.OpenInBrowser
            title="Open in Browser"
            url={pr.url || ""}
            shortcut={{ modifiers: ["cmd"], key: "o" }}
          />
          <Action.CopyToClipboard title="Copy URL" content={pr.url || ""} />
          <Action.CopyToClipboard title="Copy Title" content={pr.title} />
        </ActionPanel>
      }
    />
  );
}

export default function Command(props: LaunchProps<{ arguments: CommandArguments }>) {
  const preferences = getPreferenceValues<Preferences>();
  const [selectedDayRange, setSelectedDayRange] = useState(props.arguments.dayRange || "7");
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [viewedPRs, setViewedPRs] = useState<ViewedPRs>({});
  const [lastRefresh, setLastRefresh] = useState<string>("");
  const [hideViewedPRs, setHideViewedPRs] = useState(false);

  const fetchData = async (forceRefresh: boolean = false) => {
    try {
      setIsLoading(true);
      setError(null);
      const days = parseInt(selectedDayRange);
      
      let data: PullRequest[];
      
      if (forceRefresh) {
        // Force refresh - clear cache and fetch fresh data
        const cacheKey = getCacheKey(preferences.organization, preferences.project, preferences.repository, days);
        await LocalStorage.removeItem(cacheKey);
        console.log("Force refresh - cache cleared");
        data = await fetchPullRequests(preferences.organization, preferences.project, preferences.repository, days);
        await setCachedPRs(preferences.organization, preferences.project, preferences.repository, days, data);
      } else {
        // Use cached data if available
        data = await fetchPullRequestsWithCache(preferences.organization, preferences.project, preferences.repository, days);
      }
      
      setPullRequests(data);
      setLastRefresh(new Date().toLocaleTimeString());
      
      // Load viewed PRs
      const viewed = await getViewedPRs();
      setViewedPRs(viewed);
      
      // Clean up old caches
      await clearOldCaches();
    } catch (err) {
      const error = err as Error;
      setError(error);
      showToast({
        style: Toast.Style.Failure,
        title: "Error fetching pull requests",
        message: error.message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDayRange]);

  const revalidate = () => {
    fetchData();
  };

  const forceRefresh = () => {
    showToast({
      style: Toast.Style.Animated,
      title: "Force refreshing...",
      message: "Clearing cache and fetching fresh data",
    });
    fetchData(true);
  };

  const handleToggleViewed = async (pr: PullRequest) => {
    const isViewed = viewedPRs[pr.pullRequestId.toString()] !== undefined;
    
    await togglePRViewed(pr.pullRequestId, pr.title, isViewed);
    
    // Update local state
    const newViewedPRs = { ...viewedPRs };
    if (isViewed) {
      delete newViewedPRs[pr.pullRequestId.toString()];
      showToast({
        style: Toast.Style.Success,
        title: "Marked as unread",
        message: `PR #${pr.pullRequestId}`,
      });
    } else {
      newViewedPRs[pr.pullRequestId.toString()] = {
        viewedAt: new Date().toISOString(),
        prTitle: pr.title,
      };
      showToast({
        style: Toast.Style.Success,
        title: "Marked as viewed",
        message: `PR #${pr.pullRequestId}`,
      });
    }
    setViewedPRs(newViewedPRs);
  };

  // Filter PRs based on viewed status
  const filteredPullRequests = hideViewedPRs 
    ? pullRequests.filter(pr => !viewedPRs[pr.pullRequestId.toString()])
    : pullRequests;

  const toggleHideViewed = () => {
    setHideViewedPRs(!hideViewedPRs);
    showToast({
      style: Toast.Style.Success,
      title: hideViewedPRs ? "Showing all PRs" : "Hiding viewed PRs",
      message: hideViewedPRs ? "Viewed PRs are now visible" : "Only unread PRs will be shown",
    });
  };

  return (
    <List
      isLoading={isLoading}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select time range"
          value={selectedDayRange}
          onChange={setSelectedDayRange}
        >
          {DAY_RANGES.map((range) => (
            <List.Dropdown.Item key={range.value} title={range.label} value={range.value} />
          ))}
        </List.Dropdown>
      }
      actions={
        <ActionPanel>
          <Action title="Refresh (Cache)" onAction={revalidate} shortcut={{ modifiers: ["cmd"], key: "r" }} />
          <Action 
            title="Force Refresh (Skip Cache)" 
            onAction={forceRefresh} 
            shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
            icon={Icon.ArrowClockwise}
          />
          <Action
            title={hideViewedPRs ? "Show All PRs" : "Hide Viewed PRs"}
            icon={hideViewedPRs ? Icon.Eye : Icon.EyeSlash}
            onAction={toggleHideViewed}
            shortcut={{ modifiers: ["cmd"], key: "h" }}
          />
        </ActionPanel>
      }
    >
      {filteredPullRequests?.length === 0 ? (
        <List.EmptyView
          icon={Icon.CodeBlock}
          title={hideViewedPRs ? "No unread pull requests" : "No pull requests found"}
          description={
            hideViewedPRs 
              ? `All PRs in the last ${selectedDayRange} days have been viewed${lastRefresh ? ` (Last refresh: ${lastRefresh})` : ""}`
              : `No pull requests found in the last ${selectedDayRange} days${lastRefresh ? ` (Last refresh: ${lastRefresh})` : ""}`
          }
        />
      ) : (
        filteredPullRequests?.map((pr) => {
          const isViewed = viewedPRs[pr.pullRequestId.toString()] !== undefined;
          
          return (
            <List.Item
              key={pr.pullRequestId}
              icon={{
                source: isViewed ? Icon.CheckCircle : Icon.Circle,
                tintColor: isViewed ? "#28A745" : "#6C757D",
              }}
              title={`${getStatusEmoji(pr.status)} ${pr.title}`}
              subtitle={`#${pr.pullRequestId}${lastRefresh ? ` • ${lastRefresh}` : ""}${hideViewedPRs ? " • Unread only" : ""}`}
              accessories={[
                { text: pr.createdBy.displayName },
                { text: formatDate(pr.creationDate) },
              ]}
              actions={
                <ActionPanel>
                  <Action.Push
                    title="Show Details"
                    icon={Icon.Eye}
                    target={<PullRequestDetail pr={pr} onMarkViewed={() => handleToggleViewed(pr)} />}
                  />
                  <Action
                    title={isViewed ? "Mark as Unread" : "Mark as Viewed"}
                    icon={isViewed ? Icon.Circle : Icon.CheckCircle}
                    onAction={() => handleToggleViewed(pr)}
                    shortcut={{ modifiers: ["cmd"], key: "m" }}
                  />
                  <Action.OpenInBrowser
                    title="Open in Browser"
                    url={pr.url || ""}
                    shortcut={{ modifiers: ["cmd"], key: "o" }}
                  />
                  <Action.CopyToClipboard title="Copy URL" content={pr.url || ""} />
                  <Action title="Refresh (Cache)" onAction={revalidate} shortcut={{ modifiers: ["cmd"], key: "r" }} />
                  <Action 
                    title="Force Refresh (Skip Cache)" 
                    onAction={forceRefresh} 
                    shortcut={{ modifiers: ["cmd", "shift"], key: "r" }}
                    icon={Icon.ArrowClockwise}
                  />
                  <Action
                    title={hideViewedPRs ? "Show All PRs" : "Hide Viewed PRs"}
                    icon={hideViewedPRs ? Icon.Eye : Icon.EyeSlash}
                    onAction={toggleHideViewed}
                    shortcut={{ modifiers: ["cmd"], key: "h" }}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
