# System Design Simulator MVP Spec

## 1. Purpose

Build a visual system design simulator that lets users draw a system using generic infrastructure components, apply workload assumptions, and see which part of the design saturates or fails first.

The MVP is meant for:

- interview preparation
- system design learning
- architecture discussion during interviews or reviews
- rapid comparison of design alternatives

The MVP is not meant to be a production-grade benchmarking platform or a cloud-accurate infrastructure emulator.

## 2. Problem Statement

Current system design tools are mostly visual and static. They help users communicate architecture but do not help them reason quantitatively about bottlenecks, failure points, or the impact of design changes under load.

Users need a tool that answers questions like:

- What breaks first at 1M requests per second?
- How much does adding a cache reduce database load?
- Does introducing a queue move the bottleneck out of the synchronous path?
- Is the fanout layer the real problem instead of the database?

## 3. Product Goal

Given a user-created architecture and a workload definition, the simulator should explain:

- what the request path looks like
- how load propagates through the graph
- which component saturates first
- what symptoms appear when saturation happens
- what design change improves the result

## 4. Core Product Principle

The canvas is generic, but the simulator is typed.

- Users can name nodes anything they want, such as `Chat Service` or `Feed API`.
- The simulator reasons about node archetypes such as `Stateless Service`, `Cache`, or `Database`.
- Edges are not only visual arrows. They represent typed interactions such as synchronous call, enqueue, consume, fallback, or conditional branch.

This keeps the experience flexible for users while preserving enough semantic structure for simulation.

## 5. Primary User Personas

### Student preparing for interviews

Needs to draw common architectures quickly, apply traffic assumptions, and understand why a design fails.

### Interviewer or mentor

Needs a discussion aid that can turn architecture tradeoffs into a concrete conversation.

### Engineer exploring an architecture idea

Needs a lightweight sandbox to compare design choices before deeper implementation work.

## 6. MVP Success Criteria

The MVP is successful if a user can do the following in under 5 minutes:

1. Draw a simple system with typed components.
2. Set workload assumptions.
3. Run the simulator.
4. Identify the first bottleneck and read a plain-language explanation.
5. Modify the design, such as adding a cache or queue.
6. Re-run and compare the outcome.

## 7. In-Scope Features

### 7.1 Visual modeling

- Drag and place typed infrastructure components on a canvas.
- Rename component labels freely.
- Connect components using directed typed edges.
- Edit component properties through a side panel or inspector.

### 7.2 Generic typed components

The MVP supports a small but expressive set of component archetypes:

- Client
- Load Balancer / API Gateway
- Stateless Service
- Cache
- Database
- Queue / Stream
- Worker

### 7.3 Request flow modeling

Users can define one or more request flows through the graph.

Examples:

- read path
- write path
- async processing path

The flow system must support:

- synchronous calls
- asynchronous enqueue and consume
- conditional branching
- fallback paths
- simple fanout

### 7.4 Workload definition

The MVP supports user-entered assumptions such as:

- requests per second
- concurrent users
- read/write mix
- payload size
- cache hit rate
- fanout count

### 7.5 Simulation and analysis

The MVP computes:

- load per component
- utilization per component
- queue buildup where relevant
- latency impact
- dropped requests, timeouts, or failure conditions
- first bottleneck in the system

### 7.6 Explanation layer

The product must explain results in plain language, such as:

- The database saturates first because cache miss traffic sends 220k reads per second downstream.
- Adding a cache reduces database read load enough to keep latency within acceptable bounds.
- Queue producers outpace consumers, so queue lag grows even though the API remains healthy.

### 7.7 Design comparison

Users can duplicate a design, change one or two architectural assumptions, and compare outcomes.

## 8. Explicitly Out of Scope for MVP

The following should not be part of the first version:

- freeform arbitrary scripting of node behavior
- custom user-defined component types
- multi-region replication and geo routing
- consensus protocols and leader election
- packet-level networking simulation
- deep storage engine modeling
- autoscaling delay logic
- cost optimization engine
- security or IAM modeling
- cloud-provider-specific resource modeling
- exact real-world percentile accuracy guarantees

## 9. Product Constraints

The MVP must remain:

- generic in structure
- constrained in simulator behavior
- fast to use
- explainable
- trustworthy enough for educational reasoning

The system should prefer simple, explicit assumptions over hidden magic.

## 10. User Workflow

### 10.1 Create architecture

The user places generic typed components and connects them into a directed system graph.

### 10.2 Configure components

The user sets or accepts default values for each component archetype.

Examples:

- service replicas
- per-replica throughput
- cache hit rate assumption
- database read and write capacity
- queue consumer throughput

### 10.3 Define request flows

The user defines how a request traverses the graph, including branches such as:

- cache hit returns early
- cache miss falls through to database
- synchronous request also triggers async enqueue

### 10.4 Define workload

The user enters load assumptions for one or more request classes.

### 10.5 Run simulator

The engine computes downstream load propagation and component stress.

### 10.6 Review results

The user sees:

- bottleneck component
- saturation indicators
- affected path
- root-cause explanation

### 10.7 Iterate

The user modifies the architecture and compares outcomes.

## 11. Core Product Decisions

### 11.1 Labels are descriptive, not behavioral

The node label does not drive simulation behavior. The node archetype and properties do.

### 11.2 Edges carry semantics

An arrow is not enough. Each edge must express the interaction type and, where relevant, the routing rule.

### 11.3 Routing is constrained, not programmable

The MVP should support a small set of branch and propagation rules instead of exposing a general scripting language.

### 11.4 Use generic primitives instead of app templates

The product should remain generic and not force users into app-specific templates such as chat app or ride-sharing app.

### 11.5 Favor analytical clarity over false realism

It is better to clearly explain a simplified capacity model than to simulate hidden complexity poorly.

## 12. Functional Requirements

- The system must allow creation of a directed graph of typed nodes and edges.
- The system must preserve separation between node label and node archetype.
- The system must provide default properties for each component archetype.
- The system must allow property overrides per node.
- The system must support multiple request classes.
- The system must support conditional paths such as cache hit and cache miss.
- The system must support async queue-based paths.
- The system must compute per-component stress under load.
- The system must identify and surface the first bottleneck.
- The system must explain why the bottleneck occurs.
- The system must support cloning or comparison of designs.

## 13. Non-Functional Requirements

- The simulator should return results quickly for small and medium system graphs.
- The experience should be simple enough to use during a live interview or teaching session.
- The model should remain deterministic for the same inputs.
- The system should minimize the number of mandatory inputs needed before a first run.
- The output should be understandable to users with basic system design knowledge.

## 14. Key Risks

### 14.1 Too much freedom, not enough meaning

If users can draw anything without semantics, the simulator cannot reason about the graph reliably.

### 14.2 Too much realism, too much complexity

If the model tries to capture every distributed-systems detail, onboarding and trust will suffer.

### 14.3 Input overload

If users must configure too many parameters before the first run, they will abandon the flow.

### 14.4 Weak explanations

If the simulator only outputs charts or red boxes without clear reasoning, the educational value drops sharply.

## 15. MVP Acceptance Checklist

- A user can model a cache-aside read path.
- A user can model a service writing to a queue for async processing.
- The simulator can show a database bottleneck caused by cache miss traffic.
- The simulator can show queue lag when enqueue rate exceeds consume rate.
- The simulator can show the effect of adding a cache or increasing replicas.
- The result view includes both quantitative metrics and a plain-language explanation.

## 16. Post-MVP Opportunities

After the MVP is stable, possible expansions include:

- richer component library
- autoscaling behavior
- time-based discrete simulation
- percentile latency modeling
- region-aware deployments
- failure injection scenarios
- cost-aware architecture comparison
