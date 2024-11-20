#!/bin/bash

sleep 300

# Redis server details
REDIS_HOST="127.0.0.1"
REDIS_PORT="6379"

# Reset like_count and viewer_count to 0
redis-cli -h $REDIS_HOST -p $REDIS_PORT SET like_count 0
redis-cli -h $REDIS_HOST -p $REDIS_PORT SET viewer_count 1

# Delete the comments key
redis-cli -h $REDIS_HOST -p $REDIS_PORT DEL comments

