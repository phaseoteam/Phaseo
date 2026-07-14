using System;
using PhaseoSdk;

namespace Examples
{
    public static class ModelsExample
    {
        public static void Main()
        {
            var apiKey = Environment.GetEnvironmentVariable("PHASEO_API_KEY");
            if (string.IsNullOrEmpty(apiKey))
            {
                throw new Exception("Set PHASEO_API_KEY");
            }

            var client = new Phaseo(apiKey);
            var models = client.ListModels().GetAwaiter().GetResult();
            Console.WriteLine($"response present: {models != null}");
        }
    }
}
