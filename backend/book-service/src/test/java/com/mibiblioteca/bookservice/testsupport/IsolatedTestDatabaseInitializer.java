package com.mibiblioteca.bookservice.testsupport;

import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Objects;
import java.util.Properties;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;

/** Test-classpath guard: runs before beans, Flyway or Hibernate can write. */
public final class IsolatedTestDatabaseInitializer
        implements ApplicationContextInitializer<ConfigurableApplicationContext> {
    static final String URL = "jdbc:postgresql://127.0.0.1:5433/bookdb_tests";
    static final String USER = "booktest";

    @Override
    public void initialize(ConfigurableApplicationContext context) {
        validateConfiguration(context.getEnvironment());
        // Recheck after test customizers (including DynamicPropertySource), before bean creation.
        context.addBeanFactoryPostProcessor(beanFactory -> {
            var password = validateConfiguration(context.getEnvironment());
            verifyServer(password);
        });
    }

    static String validateConfiguration(Environment environment) {
        requireEqual(environment, "TEST_DB_URL", URL);
        requireEqual(environment, "TEST_DB_USERNAME", USER);
        var password = environment.getProperty("TEST_DB_PASSWORD");
        if (password == null || password.isBlank()) {
            throw new IllegalStateException("Missing TEST_DB_PASSWORD; test database access denied");
        }
        requireEqual(environment, "spring.datasource.url", URL);
        requireEqual(environment, "spring.datasource.username", USER);
        requireEqual(environment, "spring.datasource.password", password);
        requireEqual(environment, "spring.flyway.url", URL);
        requireEqual(environment, "spring.flyway.user", USER);
        requireEqual(environment, "spring.flyway.password", password);
        optionalEqual(environment, "spring.datasource.hikari.jdbc-url", URL);
        optionalEqual(environment, "spring.datasource.hikari.username", USER);
        optionalEqual(environment, "spring.datasource.hikari.password", password);
        for (var key : new String[] {"spring.datasource.jndi-name",
                "spring.datasource.type", "spring.datasource.hikari.data-source-class-name",
                "spring.jpa.properties.hibernate.connection.url",
                "spring.jpa.properties.jakarta.persistence.jdbc.url"}) {
            if (environment.getProperty(key) != null) {
                throw new IllegalStateException("Unsupported test datasource override: " + key);
            }
        }
        return password;
    }

    private static void requireEqual(Environment environment, String key, String expected) {
        if (!Objects.equals(expected, environment.getProperty(key))) {
            throw new IllegalStateException("Unsafe or missing test database setting: " + key);
        }
    }

    private static void optionalEqual(Environment environment, String key, String expected) {
        if (environment.getProperty(key) != null) requireEqual(environment, key, expected);
    }

    private static void verifyServer(String password) {
        var properties = new Properties();
        properties.setProperty("user", USER);
        properties.setProperty("password", password);
        properties.setProperty("connectTimeout", "5");
        properties.setProperty("socketTimeout", "5");
        properties.setProperty("options", "-c default_transaction_read_only=on");
        try (var connection = DriverManager.getConnection(URL, properties);
             var statement = connection.createStatement();
             var result = statement.executeQuery("""
                 SELECT current_database(), current_user,
                        (SELECT rolsuper OR rolcreatedb OR rolcreaterole
                         FROM pg_roles WHERE rolname = current_user),
                        EXISTS (SELECT 1 FROM pg_database WHERE datname IN ('bookdb', 'bookdb_restore_test'))
                 """)) {
            if (!result.next() || !"bookdb_tests".equals(result.getString(1))
                    || !USER.equals(result.getString(2)) || result.getBoolean(3) || result.getBoolean(4)) {
                throw new IllegalStateException("Test server identity/isolation check failed");
            }
        } catch (SQLException ex) {
            // Do not include connection strings, credentials or driver diagnostics in the message.
            throw new IllegalStateException("Cannot verify the isolated test database; access denied");
        }
    }
}
