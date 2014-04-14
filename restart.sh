#!/usr/bin/env bash
export NODE_ENV=production
forever -o debug.log -e error.log -l forever.log -a restart event.js
