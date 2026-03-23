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

            var client = new AIStats(apiKey);
            var models = client.ListModels().GetAwaiter().GetResult();
            Console.WriteLine($"response present: {models != null}");
        }
    }
}
