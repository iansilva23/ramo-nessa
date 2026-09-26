plugins {
    id("com.android.application")
    id("dev.flutter.flutter-gradle-plugin")
}

val googleMapsAndroidApiKey =
    providers.gradleProperty("RAMO_GOOGLE_MAPS_ANDROID_API_KEY")
        .orElse(providers.environmentVariable("RAMO_GOOGLE_MAPS_ANDROID_API_KEY"))
        .orElse("")
        .get()
        .trim()

val previewSigningEnabled =
    providers.environmentVariable("RAMO_PREVIEW_SIGNING")
        .orElse("false")
        .get()
        .trim()
        .equals("true", ignoreCase = true)

android {
    namespace = "br.com.ramonessa.driver"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "br.com.ramonessa.driver"
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = googleMapsAndroidApiKey
    }

    signingConfigs {
        create("preview") {
            // Chave pública de teste, isolada do package de produção.
            // Nunca usar para publicação nas lojas.
            storeFile =
                rootProject.file(
                    "../../../tooling/preview-signing/ramo-preview.keystore",
                )
            storeType = "JKS"
            storePassword = "ramo-preview-only"
            keyAlias = "ramo-preview"
            keyPassword = "ramo-preview-only"
        }
    }

    buildTypes {
        release {
            // Produção continua sem assinatura improvisada. A configuração
            // abaixo só é ativada pelo workflow exclusivo de Preview.
            if (previewSigningEnabled) {
                signingConfig = signingConfigs.getByName("preview")
                applicationIdSuffix = ".preview"
                versionNameSuffix = "-preview"
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
