# Services

Business logic and service layer for Magi.

## Structure

- `/agents` - AI agent implementations (CodeGen, SchemaDesigner, QA, etc.)
- `/routing` - Task routing and orchestration logic

## Agent Architecture

Each agent follows a standard interface:
- `execute()` - Main execution method
- `validate()` - Input validation
- `getCapabilities()` - Returns agent capabilities
- `getMetrics()` - Performance metrics