#!/bin/bash

sudo systemctl start bostan-api.service
sudo systemctl start bostan-ui.service

echo "Bostan started."
