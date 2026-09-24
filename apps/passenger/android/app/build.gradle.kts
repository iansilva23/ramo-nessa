plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val mercadoPagoPublicKey =
    providers.gradleProperty("RAMO_MERCADO_PAGO_PUBLIC_KEY")
        .orElse(providers.environmentVariable("RAMO_MERCADO_PAGO_PUBLIC_KEY"))
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
    namespace = "br.com.ramonessa.passenger"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "br.com.ramonessa.passenger"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        val escapedPublicKey =
            mercadoPagoPublicKey.replace("\\", "\\\\").replace("\"", "\\\"")
        buildConfigField(
            "String",
            "MERCADO_PAGO_PUBLIC_KEY",
            "\"$escapedPublicKey\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("preview") {
            // Chave pública de teste, isolada do package de produção.
            // Nunca usar para publicação nas lojas.
            storeFile =
                rootProject.file(
                    "../../../tooling/preview-signing/ramo-preview.keystore",
                )
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

dependencies {
    implementation(
        platform("com.mercadopago.android.sdk:sdk-android-bom:0.2.3"),
    )
    implementation("com.mercadopago.android.sdk:core-methods")
    // Os campos PCI XML do Mercado Pago herdam de AbstractComposeView.
    // O SDK publica essas classes na API, então o app consumidor precisa
    // ter Compose UI também no classpath de compilação.
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.activity:activity-ktx:1.11.0")
}

flutter {
    source = "../.."
}
