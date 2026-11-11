import type {
  Catalog,
  CatalogField,
  CatalogItem,
  NodeArchetype,
  NodeProperties,
} from "../../lib/api";

// Test fixture shaped like the Phase 3 catalog (server/internal/catalog). Values are illustrative.

const baseFields: CatalogField[] = [
  {
    key: "replicas",
    label: "Instances",
    help: "How many copies run in parallel.",
    min: 1,
    max: 1000,
    step: 1,
    primary: true,
  },
  {
    key: "capacity_rps",
    label: "Capacity per instance",
    help: "Requests one instance can serve per second.",
    unit: "req/s",
    min: 1,
    max: 10_000_000,
    step: 100,
    primary: true,
  },
  {
    key: "base_latency_ms",
    label: "Latency",
    help: "Time to serve one request when idle.",
    unit: "ms",
    min: 0,
    max: 60_000,
    step: 1,
    primary: true,
  },
];

const cacheFields: CatalogField[] = [
  ...baseFields,
  {
    key: "cache_hit_rate",
    label: "Hit rate",
    help: "Share of reads answered from the cache.",
    min: 0,
    max: 1,
    step: 0.05,
  },
];

const ALLOWED_TARGETS: Record<NodeArchetype, NodeArchetype[]> = {
  client: ["cdn", "gateway", "stateless_service"],
  cdn: ["gateway", "stateless_service", "object_store"],
  gateway: ["gateway", "stateless_service"],
  stateless_service: [
    "stateless_service",
    "cache",
    "database",
    "object_store",
    "search",
    "queue",
  ],
  worker: ["stateless_service", "cache", "database", "object_store", "search", "queue"],
  cache: ["database", "search"],
  queue: ["worker", "stateless_service"],
  database: [],
  object_store: [],
  search: [],
};

const databaseFields: CatalogField[] = [
  ...baseFields,
  { key: "shards", label: "Shards", min: 1, max: 1024, step: 1 },
  { key: "read_replicas", label: "Read replicas per shard", min: 0, max: 15, step: 1 },
];

function props(replicas: number, capacity: number, latency: number, hit?: number): NodeProperties {
  return {
    replicas,
    capacity_rps: capacity,
    base_latency_ms: latency,
    ...(hit === undefined ? {} : { cache_hit_rate: hit }),
  };
}

function item(
  id: string,
  name: string,
  categoryID: string,
  icon: string,
  description: string,
  kind: NodeArchetype,
  defaults: NodeProperties,
): CatalogItem {
  const fields =
    kind === "client"
      ? []
      : kind === "cache" || kind === "cdn"
        ? cacheFields
        : kind === "database"
          ? databaseFields
          : baseFields;
  return {
    id,
    name,
    category_id: categoryID,
    description,
    icon,
    kind,
    default_properties: defaults,
    fields,
    allowed_targets: ALLOWED_TARGETS[kind],
  };
}

export const catalogFixture: Catalog = {
  categories: [
    { id: "clients", name: "Clients" },
    { id: "edge", name: "Edge and routing" },
    { id: "compute", name: "Compute" },
    { id: "data", name: "Data" },
    { id: "messaging", name: "Messaging" },
  ],
  items: [
    item("client", "Client", "clients", "users", "Where traffic comes from.", "client", {}),
    item(
      "cdn",
      "CDN",
      "edge",
      "world",
      "Edge cache for static and cacheable content.",
      "cdn",
      props(10, 100000, 5, 0.9),
    ),
    item(
      "load-balancer",
      "Load balancer",
      "edge",
      "arrows-split-2",
      "Spreads incoming requests evenly across the services behind it.",
      "gateway",
      props(2, 25000, 8),
    ),
    item(
      "api-gateway",
      "API gateway",
      "edge",
      "door-enter",
      "Single entry point that handles routing, auth and rate limiting.",
      "gateway",
      props(2, 20000, 10),
    ),
    item(
      "service",
      "Service",
      "compute",
      "server",
      "Stateless application service that handles requests.",
      "stateless_service",
      props(2, 10000, 20),
    ),
    item(
      "worker",
      "Worker",
      "compute",
      "settings-automation",
      "Background consumer that processes queued jobs.",
      "worker",
      props(3, 12000, 30),
    ),
    item("redis", "Redis", "data", "bolt", "In-memory cache.", "cache", props(1, 50000, 3, 0.8)),
    item(
      "memcached",
      "Memcached",
      "data",
      "bolt",
      "Simple in-memory cache.",
      "cache",
      props(1, 60000, 2, 0.8),
    ),
    item(
      "postgres",
      "Postgres",
      "data",
      "database",
      "Relational database.",
      "database",
      props(1, 7000, 25),
    ),
    item(
      "mysql",
      "MySQL",
      "data",
      "database",
      "Relational database.",
      "database",
      props(1, 6000, 25),
    ),
    item(
      "dynamodb",
      "DynamoDB",
      "data",
      "table",
      "Managed key-value store.",
      "database",
      props(1, 20000, 10),
    ),
    item(
      "cassandra",
      "Cassandra",
      "data",
      "table",
      "Wide-column store.",
      "database",
      props(1, 15000, 15),
    ),
    item(
      "s3",
      "S3",
      "data",
      "bucket",
      "Object storage.",
      "object_store",
      props(1, 5500, 30),
    ),
    item(
      "elasticsearch",
      "Elasticsearch",
      "data",
      "search",
      "Full-text search.",
      "search",
      props(1, 5000, 20),
    ),
    item("kafka", "Kafka", "messaging", "stack-2", "Distributed log.", "queue", props(1, 40000, 4)),
    item(
      "sqs",
      "SQS",
      "messaging",
      "stack-2",
      "Managed message queue.",
      "queue",
      props(1, 30000, 10),
    ),
    item(
      "rabbitmq",
      "RabbitMQ",
      "messaging",
      "stack-2",
      "Message broker.",
      "queue",
      props(1, 20000, 5),
    ),
  ],
};
