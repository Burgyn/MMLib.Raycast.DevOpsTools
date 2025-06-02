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

function getStatusIcon(status: string): Icon {
  switch (status.toLowerCase()) {
    case "active":
      return Icon.Circle;
    case "completed":
      return Icon.CheckCircle;
    case "abandoned":
      return Icon.XMarkCircle;
    default:
      return Icon.Dot;
  }
}

function getStatusColor(status: string): string {
  switch (status.toLowerCase()) {
    case "active":
      return "#007ACC";
    case "completed":
      return "#28A745";
    case "abandoned":
      return "#DC3545";
    default:
      return "#6C757D";
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

function PullRequestDetail({ pr }: { pr: PullRequest }) {
  const reviewersSection = pr.reviewers.length > 0 
    ? `\n## Reviewers\n${pr.reviewers.map(r => `${getVoteIcon(r.vote)} ${r.displayName}`).join('\n')}`
    : '';

  const markdown = `
# ${pr.title}

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

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const days = parseInt(selectedDayRange);
      const data = await fetchPullRequests(preferences.organization, preferences.project, preferences.repository, days);
      setPullRequests(data);
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
          <Action title="Refresh" onAction={revalidate} shortcut={{ modifiers: ["cmd"], key: "r" }} />
        </ActionPanel>
      }
    >
      {pullRequests?.length === 0 ? (
        <List.EmptyView
          icon={Icon.CodeBlock}
          title="No pull requests found"
          description={`No pull requests found in the last ${selectedDayRange} days`}
        />
      ) : (
        pullRequests?.map((pr) => (
          <List.Item
            key={pr.pullRequestId}
            icon={{
              source: getStatusIcon(pr.status),
              tintColor: getStatusColor(pr.status),
            }}
            title={pr.title}
            subtitle={`#${pr.pullRequestId}`}
            accessories={[
              { text: pr.createdBy.displayName },
              { text: formatDate(pr.creationDate) },
            ]}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Show Details"
                  icon={Icon.Eye}
                  target={<PullRequestDetail pr={pr} />}
                />
                <Action.OpenInBrowser
                  title="Open in Browser"
                  url={pr.url || ""}
                  shortcut={{ modifiers: ["cmd"], key: "o" }}
                />
                <Action.CopyToClipboard title="Copy URL" content={pr.url || ""} />
                <Action title="Refresh" onAction={revalidate} shortcut={{ modifiers: ["cmd"], key: "r" }} />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
