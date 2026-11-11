import type {
  Catalog,
  CatalogField,
  CatalogItem,
  EdgeInteractionType,
  NodeArchetype,
  NodeProperties,
  RoutingRuleType,
} from "../../lib/api";

// Mirrors server/internal/catalog/catalog.go. Used by unit tests and, until the server
// branch with GET /catalog is merged, by the dev-only fallback in features/catalog.

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

function interactions(kind: NodeArchetype): EdgeInteractionType[] {
  switch (kind) {
    case "client":
    case "database":
      return ["sync_request", "fallback"];
    case "gateway":
      return ["sync_request"];
    case "cache":
      return ["sync_request", "conditional_branch", "fallback"];
    case "queue":
      return ["consume"];
    default:
      return ["sync_request", "async_enqueue", "fallback"];
  }
}

function routingRules(kind: NodeArchetype): RoutingRuleType[] {
  return kind === "cache" ? ["always", "cache_hit", "cache_miss"] : ["always"];
}

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
  const fields = kind === "client" ? [] : kind === "cache" ? cacheFields : baseFields;
  return {
    id,
    name,
    category_id: categoryID,
    description,
    icon,
    kind,
    default_properties: defaults,
    fields,
    supported_interactions: interactions(kind),
    supported_routing_rules: routingRules(kind),
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
