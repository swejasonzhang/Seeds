// Must be the first import of the entry point so instrumentation patches http/express/mongodb before they load.
import { createRequire } from 'node:module';
import path from 'node:path';

const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
if (connectionString) {
  // Loaded lazily: the OpenTelemetry stack is heavy and only needed when Application Insights is configured.
  const require = createRequire(path.join(process.cwd(), 'noop.js'));
  const { useAzureMonitor } = require('@azure/monitor-opentelemetry') as typeof import('@azure/monitor-opentelemetry');
  useAzureMonitor({ azureMonitorExporterOptions: { connectionString } });
}
