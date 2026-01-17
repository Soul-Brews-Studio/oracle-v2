# Robin's Skills

Skills ใช้จาก plugin: `oracle-skills@soul-brews-plugin`

## Available Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| /recap | Fresh start | Get session context |
| /rrr | Session end | Create retrospective |
| /feel | Emotion | Log feelings |
| /fyi | Information | Store info |
| /trace | Search | Find anything |
| /forward | Handoff | Create handoff |
| /standup | Morning | Daily check |
| /where-we-are | Status | Session awareness |
| /project | Repos | Clone repos |
| /learn | Study | Explore codebase |
| /watch | Video | YouTube learning |
| /schedule | Calendar | Query schedule |
| /context-finder | Search | Find in history |

## Local Scripts

Scripts in `.claude/scripts/`:
- `recap.sh` - Fast recap without AI
- `statusline.sh` - Update focus status

## Usage

Skills are invoked via the plugin system. Just type:
```
/recap
/feel happy
/fyi remember this
```
