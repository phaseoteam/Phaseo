using System;
using AiStatsSdk;

namespace Examples
{
    public static class ModelsExample
    {
        public static void Main()
        {
            var apiKey = Environment.GetEnvironmentVariable("AI_STATS_API_KEY");
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new Exception("Set AI_STATS_API_KEY");
            }

            var client = new Client(apiKey);
            var models = client.GetModels(limit: 5);
            Console.WriteLine($"models count: {models.Models?.Count}");
        }
    }
}
