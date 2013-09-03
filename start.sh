#!/usr/bin/env bash

forever -o debug.log -e error.log -l forever.log -a start event.js
