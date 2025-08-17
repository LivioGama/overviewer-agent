"use client";

import { useAuth } from "@/components/auth/AuthProvider";

const features = [
  {
    title: "AI-Powered Refactoring",
    description:
      "Automatically improve code quality, readability, and performance with AI assistance.",
    icon: "🔧",
    command: "/refactor",
  },
  {
    title: "Test Generation",
    description:
      "Generate comprehensive unit tests for your codebase with edge cases and mocking.",
    icon: "🧪",
    command: "/test",
  },
  {
    title: "Documentation",
    description:
      "Create and maintain up-to-date documentation for functions, classes, and modules.",
    icon: "📚",
    command: "/docs",
  },
  {
    title: "Security Audit",
    description:
      "Identify and fix security vulnerabilities in your code automatically.",
    icon: "🔒",
    command: "/security",
  },
  {
    title: "Bug Fixes",
    description:
      "Analyze and fix bugs with AI-powered debugging and solution suggestions.",
    icon: "🐛",
    command: "/fix",
  },
  {
    title: "Code Quality",
    description:
      "Improve code quality with best practices, performance optimizations, and clean code principles.",
    icon: "✨",
    command: "/quality",
  },
];

export const WelcomeScreen = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-12">
      {/* Features Grid */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 transition-colors">
          Features & Commands
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="card p-6 hover:shadow-lg transition-all"
            >
              <div className="flex items-start space-x-4">
                <div className="text-3xl">{feature.icon}</div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-3 transition-colors">
                    {feature.description}
                  </p>
                  <code className="text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-primary-600 dark:text-primary-400 font-mono transition-colors">
                    {feature.command}
                  </code>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Getting Started */}
      <section className="card p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 transition-colors">
          Getting Started
        </h2>
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
              1
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors">
                Install the GitHub App
              </h3>
              <p className="text-gray-600 dark:text-gray-300 transition-colors">
                Install Ollama Turbo Agent on your GitHub repositories to enable
                automation.
              </p>
              {!user && (
                <button className="mt-2 btn btn-primary">
                  Install GitHub App
                </button>
              )}
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
              2
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors">
                Configure Repository
              </h3>
              <p className="text-gray-600 dark:text-gray-300 transition-colors">
                Add a{" "}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded transition-colors">
                  .ollama-turbo.yml
                </code>{" "}
                configuration file to customize automation settings.
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-4">
            <div className="w-8 h-8 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
              3
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 transition-colors">
                Use Commands
              </h3>
              <p className="text-gray-600 dark:text-gray-300 transition-colors">
                Comment on issues or pull requests with commands like{" "}
                <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded transition-colors">
                  /refactor
                </code>{" "}
                to trigger automation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Example Configuration */}
      <section className="card p-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 transition-colors">
          Example Configuration
        </h2>
        <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-6 overflow-x-auto transition-colors">
          <pre className="text-sm text-gray-100">
            <code>{`# .ollama-turbo.yml
automation:
  triggers:
    - comment
    - pr_opened
  tasks:
    refactor:
      model: "gpt-oss:120b"
      max_tokens: 4000
      timeout: 300
    test:
      model: "gpt-oss:120b"
      auto_fix: true
  approval:
    required: true
    maintainers_only: true
  output:
    open_pr: true
    push_direct: false`}</code>
          </pre>
        </div>
      </section>

      {/* Stats */}
      <section>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 transition-colors">
          Why Choose Ollama Turbo Agent?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 transition-colors">
              10x
            </div>
            <div className="text-gray-600 dark:text-gray-300 transition-colors">
              Faster Development
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 transition-colors">
              95%
            </div>
            <div className="text-gray-600 dark:text-gray-300 transition-colors">
              Code Quality Improvement
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 transition-colors">
              24/7
            </div>
            <div className="text-gray-600 dark:text-gray-300 transition-colors">
              Automated Assistance
            </div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary-600 dark:text-primary-400 transition-colors">
              0
            </div>
            <div className="text-gray-600 dark:text-gray-300 transition-colors">
              Manual Effort Required
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
