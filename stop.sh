#!/bin/bash

sudo systemctl stop bostan-ui.service
sudo systemctl stop bostan-api.service

echo "Bostan stopped."
