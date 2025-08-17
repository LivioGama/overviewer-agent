"use client";

import { Job } from "@ollama-turbo-agent/shared";
import axios from "axios";
import { useEffect, useState } from "react";

interface DashboardStats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  queuedJobs: number;
}

export const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentJobs, setRecentJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [statsResponse, jobsResponse] = await Promise.all([
        axios.get("/api/dashboard/stats"),
        axios.get("/api/dashboard/recent-jobs"),
      ]);

      setStats(statsResponse.data);
      setRecentJobs(jobsResponse.data);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="Total Jobs"
          value={stats?.totalJobs || 0}
          icon="📊"
          color="bg-blue-500"
        />
        <StatCard
          title="Completed"
          value={stats?.completedJobs || 0}
          icon="✅"
          color="bg-green-500"
        />
        <StatCard
          title="Failed"
          value={stats?.failedJobs || 0}
          icon="❌"
          color="bg-red-500"
        />
        <StatCard
          title="Queued"
          value={stats?.queuedJobs || 0}
          icon="⏳"
          color="bg-yellow-500"
        />
      </div>

      {/* Recent Jobs */}
      <div className="card p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 transition-colors">
          Recent Jobs
        </h2>
        {recentJobs.length > 0 ? (
          <div className="space-y-4">
            {recentJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400 transition-colors">
            No jobs found. Start by commenting on an issue or PR with a command
            like{" "}
            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded text-sm">
              /refactor
            </code>
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard = ({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: number;
  icon: string;
  color: string;
}) => (
  <div className="card p-6">
    <div className="flex items-center">
      <div
        className={`w-12 h-12 ${color} rounded-lg flex items-center justify-center text-white text-xl`}
      >
        {icon}
      </div>
      <div className="ml-4">
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 transition-colors">
          {title}
        </h3>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 transition-colors">
          {value}
        </p>
      </div>
    </div>
  </div>
);

const JobCard = ({ job }: { job: Job }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30";
      case "failed":
        return "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30";
      case "in_progress":
        return "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30";
      case "queued":
        return "text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30";
      default:
        return "text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800";
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-all">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-3">
            <h3 className="font-medium text-gray-900 dark:text-gray-100 transition-colors">
              {job.repoOwner}/{job.repoName}
            </h3>
            <span
              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(job.status)}`}
            >
              {job.status}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 transition-colors">
              {job.taskType}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 transition-colors">
            Triggered by {job.triggerType} •{" "}
            {new Date(job.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <button className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-sm font-medium transition-colors">
            View Details
          </button>
        </div>
      </div>
    </div>
  );
};

const DashboardSkeleton = () => (
  <div className="space-y-8">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card p-6">
          <div className="animate-pulse">
            <div className="h-12 w-12 bg-gray-300 dark:bg-gray-600 rounded-lg mb-4"></div>
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4 mb-2"></div>
            <div className="h-8 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
          </div>
        </div>
      ))}
    </div>
    <div className="card p-6">
      <div className="animate-pulse">
        <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-1/4 mb-4"></div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-gray-300 dark:bg-gray-600 rounded"
            ></div>
          ))}
        </div>
      </div>
    </div>
  </div>
);
