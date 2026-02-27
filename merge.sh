#!/bin/bash

# Script to merge all local branches into the current branch
# Skips branches with merge conflicts and continues with others

# Get the current branch name
current_branch=$(git rev-parse --abbrev-ref HEAD)

echo "Current branch: $current_branch"
echo "Starting merge process..."
echo ""

# Get all local branches except the current one
branches=$(git for-each-ref --format='%(refname:short)' refs/heads/ | grep -v "^$current_branch$")

# Track success and failures
merged_branches=()
failed_branches=()

# Iterate through each branch
for branch in $branches; do
    echo "Attempting to merge: $branch"
    
    # Try to merge the branch
    if git merge --no-edit "$branch"; then
        echo "Successfully merged: $branch"
        merged_branches+=("$branch")
    else
        # Merge failed, abort it
        echo "Merge conflict detected in: $branch"
        git merge --abort
        failed_branches+=("$branch")
    fi
    echo ""
done

# Print summary
echo "==================================="
echo "Merge Summary"
echo "==================================="
echo "Successfully merged ${#merged_branches[@]} branches:"
for branch in "${merged_branches[@]}"; do
    echo "  $branch"
done

if [ ${#failed_branches[@]} -gt 0 ]; then
    echo ""
    echo "Failed to merge ${#failed_branches[@]} branches (conflicts):"
    for branch in "${failed_branches[@]}"; do
        echo "  $branch"
    done
fi
