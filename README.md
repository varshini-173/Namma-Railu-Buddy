# Namma-Railu Buddy 🚆 (Android Edition)

A community-powered passenger guide for local trains in the Karnataka region.

## Kotlin / Android Development

This project includes a complete Native Android implementation in the `/android` directory.

### Structure:
- **Build System**: Gradle Kotlin DSL (`build.gradle.kts`)
- **UI Framework**: Jetpack Compose 2025 (Material 3)
- **Firebase SDK**: Integrated for Firestore and Auth
- **Geofencing**: Fused Location Provider with distance calculations

### How to Build:
1. Export the project as a ZIP or to GitHub.
2. Open the `/android` folder in **Android Studio**.
3. The project uses manual Firebase initialization based on your `firebase-applet-config.json`, so it works out of the box!
4. Build and Run!

## Backend (Firebase)

- **Firestore**: Stores live platform pings.
- **Security Rules**: Handled via `firestore.rules` (already deployed).
- **Authentication**: Google/Anonymous login supported.

## Web Preview

The web preview in this environment is a lightweight shim that points you to the Android files. For full mobile functionality (Geolocation, Vibration, Native UI), use the Android source code located in the `/android` folder.
