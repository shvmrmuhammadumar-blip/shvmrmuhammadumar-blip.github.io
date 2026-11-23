@echo off
if not exist D:\GradleCacheLumo mkdir D:\GradleCacheLumo
if not exist D:\TempLumoBuild mkdir D:\TempLumoBuild
set "JAVA_HOME=D:\Java\jdk-17"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "GRADLE_USER_HOME=D:\GradleCacheLumo"
set "TEMP=D:\TempLumoBuild"
set "TMP=D:\TempLumoBuild"
cd /d D:\Projects\lumo\android
gradlew.bat app:assembleDebug -x lint -x test --configure-on-demand --build-cache -PreactNativeDevServerPort=8081
