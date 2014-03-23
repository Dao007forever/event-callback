event-callback
==============
This is a simple service to register an event tracking and a set of actions (now only support HTTP POST.)

When one event happen, it will execute its set of registered action. The rationale is for callbacks of a system,
where the system doesn't want to store the set of actions (an eventbus service?)
