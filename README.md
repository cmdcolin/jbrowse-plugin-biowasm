# jbrowse-plugin-biowasm

This uses @biowasm/aioli to parse BAM files. The emscripten code can "mount"
remote files to the emscripten filesystem. Once this is done, we can run
samtools view to generate a 1-to-1 comparison with our normal JS code

![](img/1.png)

## Notes

Also see https://github.com/cmdcolin/aioli_demo
