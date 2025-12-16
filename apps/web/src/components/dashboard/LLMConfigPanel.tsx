import { useEffect, useState } from "react";
import axios from "axios";

interface LLMIntegration {
  name: string;
  type: string;
}

export const LLMConfigPanel = () => {
  const [llmIntegrations, setLlmIntegrations] = useState<LLMIntegration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLlmIntegrations();
  }, []);

  const fetchLlmIntegrations = async () => {
    try {
      const response = await axios.get("/api/config/llm");
      setLlmIntegrations(response.data);
    } catch (error) {
      console.error("Failed to fetch LLM integrations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await axios.post("/api/config/llm", llmIntegrations);
      alert("LLM integrations saved successfully!");
    } catch (error) {
      console.error("Failed to save LLM integrations:", error);
    }
  };

  if (loading) {
    return <div>Loading LLM integrations...</div>;
  }

  return (
    <div className="card p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4 transition-colors">
        LLM Configurations
      </h2>
      <ul className="space-y-4">
        {llmIntegrations.map((llm, index) => (
          <li key={index} className="flex justify-between items-center">
            <span>{llm.name} - {llm.type}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={handleSave}
        className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Save Configurations
      </button>
    </div>
  );
};
