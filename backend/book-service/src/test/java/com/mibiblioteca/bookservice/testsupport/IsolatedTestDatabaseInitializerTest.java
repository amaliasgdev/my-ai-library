package com.mibiblioteca.bookservice.testsupport;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.support.SpringFactoriesLoader;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.mock.env.MockEnvironment;

class IsolatedTestDatabaseInitializerTest {
    private static final String PASSWORD = "unit-test-placeholder-not-a-real-secret";

    @Test
    void acceptsOnlyExplicitTestSettingsWithoutConnecting() {
        assertThat(IsolatedTestDatabaseInitializer.validateConfiguration(environment())).isEqualTo(PASSWORD);
    }

    @Test
    void missingSettingsCannotFallBackToDevelopment() {
        assertThatThrownBy(() -> IsolatedTestDatabaseInitializer.validateConfiguration(new MockEnvironment()))
            .isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"TEST_DB_URL", "spring.datasource.url", "spring.flyway.url",
        "spring.datasource.hikari.jdbc-url"})
    void rejectsOriginalDatabaseAndOtherEndpoints(String key) {
        var environment = environment().withProperty(key, "jdbc:postgresql://localhost:5432/bookdb");
        assertThatThrownBy(() -> IsolatedTestDatabaseInitializer.validateConfiguration(environment))
            .isInstanceOf(IllegalStateException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"TEST_DB_USERNAME", "spring.datasource.username", "spring.flyway.user",
        "spring.datasource.hikari.username"})
    void rejectsOwnerCredentials(String key) {
        assertThatThrownBy(() -> IsolatedTestDatabaseInitializer.validateConfiguration(
            environment().withProperty(key, "booksvc"))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void rejectsBlankPasswordWithoutLeakingIt() {
        assertThatThrownBy(() -> IsolatedTestDatabaseInitializer.validateConfiguration(
            environment().withProperty("TEST_DB_PASSWORD", "")))
            .isInstanceOf(IllegalStateException.class).hasMessageNotContaining(PASSWORD);
    }

    @Test
    void guardIsRegisteredForEveryBootTestContext() {
        assertThat(SpringFactoriesLoader.loadFactories(ApplicationContextInitializer.class, getClass().getClassLoader()))
            .anyMatch(IsolatedTestDatabaseInitializer.class::isInstance);
    }

    @Test
    void rejectsLateOverridesBeforeAnyBeansOrConnectionAreCreated() {
        var environment = environment();
        try (var context = new GenericApplicationContext()) {
            context.setEnvironment(environment);
            new IsolatedTestDatabaseInitializer().initialize(context);
            environment.setProperty("spring.flyway.url", "jdbc:postgresql://localhost:5432/bookdb");
            assertThatThrownBy(context::refresh).isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("spring.flyway.url");
        }
    }

    private MockEnvironment environment() {
        return new MockEnvironment()
            .withProperty("TEST_DB_URL", IsolatedTestDatabaseInitializer.URL)
            .withProperty("TEST_DB_USERNAME", IsolatedTestDatabaseInitializer.USER)
            .withProperty("TEST_DB_PASSWORD", PASSWORD)
            .withProperty("spring.datasource.url", IsolatedTestDatabaseInitializer.URL)
            .withProperty("spring.datasource.username", IsolatedTestDatabaseInitializer.USER)
            .withProperty("spring.datasource.password", PASSWORD)
            .withProperty("spring.flyway.url", IsolatedTestDatabaseInitializer.URL)
            .withProperty("spring.flyway.user", IsolatedTestDatabaseInitializer.USER)
            .withProperty("spring.flyway.password", PASSWORD);
    }
}
