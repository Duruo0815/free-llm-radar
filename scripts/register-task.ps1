# Register the CN-view probe scheduled task (every 6 hours, catch up on missed runs)
$scriptPath = 'D:\Zcode WorkSpace\free-llm-radar\scripts\cn-update.cmd'
$action = New-ScheduledTaskAction -Execute $scriptPath
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 6) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd
Register-ScheduledTask -TaskName 'FreeLLMRadar-CN-Probe' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
$task = Get-ScheduledTask -TaskName 'FreeLLMRadar-CN-Probe'
Write-Output ("task state: " + $task.State)
Write-Output ("execute: " + $task.Actions[0].Execute)
Write-Output ("interval: " + $task.Triggers[0].Repetition.Interval)
