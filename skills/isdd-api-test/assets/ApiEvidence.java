package isdd.apitest;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import java.util.HashMap;
import java.util.stream.Collectors;
import org.junit.jupiter.api.extension.ExtensionContext;
import org.junit.jupiter.api.extension.ParameterContext;
import org.junit.jupiter.api.extension.ParameterResolver;
import org.junit.jupiter.api.extension.TestWatcher;
import org.mockito.Mockito;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.ApplicationContext;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultHandler;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.DispatcherServlet;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/** Register with @ExtendWith(ApiEvidence.class); inject Evidence into individual tests. */
public final class ApiEvidence implements ParameterResolver, TestWatcher {
    private static final ExtensionContext.Namespace STORE =
        ExtensionContext.Namespace.create(ApiEvidence.class);

    public static final class Evidence {
        private final ExtensionContext context;
        private final List<List<String>> observations = new ArrayList<>();

        private Evidence(ExtensionContext context) { this.context = context; }

        /** Invoke in a full application test containing all business routes for this profile. */
        public void inventory(ApplicationContext app) {
            if (!AnnotatedElementUtils.hasAnnotation(context.getRequiredTestClass(), SpringBootTest.class))
                throw new IllegalStateException("Inventory needs a full @SpringBootTest context");
            if (!app.getBeansOfType(RouterFunction.class).isEmpty())
                throw new IllegalStateException("Functional MVC routes require a separate inventory adapter");
            observations.add(List.of("inventory"));
            for (String profile : app.getEnvironment().getActiveProfiles())
                observations.add(List.of("profile", profile));
            var declared = new HashMap<String, HandlerMethod>();
            for (var mapping : app.getBeansOfType(RequestMappingHandlerMapping.class).values()) {
                mapping.getHandlerMethods().forEach((info, handler) -> {
                    if (frameworkError(handler)) return;
                    if (info.getMethodsCondition().getMethods().isEmpty())
                        throw new IllegalStateException("Unbounded HTTP methods: " + info);
                    for (String pattern : info.getPatternValues())
                        for (var method : info.getMethodsCondition().getMethods()) {
                            String key = operation(info, method.name(), pattern);
                            if (declared.putIfAbsent(key, handler) != null)
                                throw new IllegalStateException("Duplicate operation identity: " + key);
                            observations.add(List.of("route", key));
                        }
                });
            }
        }

        /** Call after response and business side-effect assertions, only for the action under test. */
        public void scenario(String id, MvcResult result, Class<?> businessBean, Class<?>... others) {
            if (id == null || id.isBlank()) throw new IllegalArgumentException("Missing scenario id");
            if (!(result.getHandler() instanceof HandlerMethod handler))
                throw new IllegalStateException("No MVC controller handled the request");
            var error = result.getResolvedException();
            if (error instanceof org.springframework.validation.BindException
                    || error instanceof org.springframework.beans.TypeMismatchException
                    || error instanceof org.springframework.http.converter.HttpMessageNotReadableException
                    || error instanceof org.springframework.web.bind.ServletRequestBindingException)
                throw new IllegalStateException("Request rejected before business execution", error);
            var app = application(result);
            if (app == null) throw new IllegalStateException("Missing MVC application context");
            var types = new ArrayList<Class<?>>(List.of(businessBean));
            types.addAll(List.of(others));
            for (Class<?> type : types) {
                Object bean = app.getBean(type);
                Object target = AopUtils.isAopProxy(bean) ? AopTestUtils.getUltimateTargetObject(bean) : bean;
                if (Mockito.mockingDetails(target).isMock())
                    throw new IllegalStateException("Expected real business bean: " + type.getName());
            }
            observations.add(List.of("scenario", matchedOperation(result, handler), id, context.getUniqueId()));
        }
    }

    private static ApplicationContext application(MvcResult result) {
        return (ApplicationContext) result.getRequest().getAttribute(DispatcherServlet.WEB_APPLICATION_CONTEXT_ATTRIBUTE);
    }

    private static boolean frameworkError(HandlerMethod handler) {
        String name = handler.getBeanType().getName();
        return name.equals("org.springframework.boot.autoconfigure.web.servlet.error.BasicErrorController")
            || name.equals("org.springframework.boot.webmvc.autoconfigure.error.BasicErrorController");
    }

    private static String matchedOperation(MvcResult result, HandlerMethod handler) {
        var request = result.getRequest();
        String pattern = String.valueOf(request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE));
        var candidates = new ArrayList<String>();
        for (var mapping : application(result).getBeansOfType(RequestMappingHandlerMapping.class).values()) {
            mapping.getHandlerMethods().forEach((info, mapped) -> {
                if (mapped.getMethod().equals(handler.getMethod()) && mapped.getBeanType().equals(handler.getBeanType())
                        && info.getPatternValues().contains(pattern))
                    candidates.add(operation(info, request.getMethod(), pattern));
            });
        }
        if (candidates.size() != 1)
            throw new IllegalStateException("Ambiguous or missing mapping for " + handler + ": " + candidates);
        return candidates.get(0);
    }

    /** Optional .alwaysDo(hitRecorder()) on MockMvc; hits are diagnostic only. */
    public static ResultHandler hitRecorder() {
        return result -> {
            if (System.getenv("ISDD_API_EVENTS") != null && result.getHandler() instanceof HandlerMethod handler
                    && !frameworkError(handler))
                emit(List.of(List.of("hit", matchedOperation(result, handler))));
        };
    }

    private static String operation(RequestMappingInfo info, String method, String path) {
        var conditions = new ArrayList<String>();
        if (!info.getParamsCondition().isEmpty()) conditions.add("params=" + info.getParamsCondition());
        if (!info.getHeadersCondition().isEmpty()) conditions.add("headers=" + info.getHeadersCondition());
        if (!info.getConsumesCondition().isEmpty()) conditions.add("consumes=" + info.getConsumesCondition());
        if (!info.getProducesCondition().isEmpty()) conditions.add("produces=" + info.getProducesCondition());
        if (info.getCustomCondition() != null) conditions.add("custom=" + info.getCustomCondition());
        // Spring 7 adds API version to mappings; keep the same source usable with Spring 6.
        try {
            Object version = info.getClass().getMethod("getVersionCondition").invoke(info);
            if (version != null && !Boolean.TRUE.equals(version.getClass().getMethod("isEmpty").invoke(version)))
                conditions.add("version=" + version);
        } catch (NoSuchMethodException oldSpring) {
            // Spring 6 has no version condition.
        } catch (ReflectiveOperationException e) { throw new IllegalStateException(e); }
        return method + " " + path + (conditions.isEmpty() ? "" : " " + String.join(" ", conditions));
    }

    @Override public boolean supportsParameter(ParameterContext p, ExtensionContext c) {
        return p.getParameter().getType() == Evidence.class && p.getDeclaringExecutable() instanceof java.lang.reflect.Method;
    }

    @Override public Evidence resolveParameter(ParameterContext p, ExtensionContext c) {
        return c.getStore(STORE).getOrComputeIfAbsent("evidence", k -> new Evidence(c), Evidence.class);
    }

    @Override public void testSuccessful(ExtensionContext c) {
        var evidence = c.getStore(STORE).get("evidence", Evidence.class);
        if (evidence != null) emit(evidence.observations);
    }

    private static void emit(List<List<String>> observations) {
        String directory = System.getenv("ISDD_API_EVENTS");
        if (directory == null || observations.isEmpty()) return;
        var encoder = Base64.getUrlEncoder().withoutPadding();
        var lines = observations.stream().map(row -> row.stream()
            .map(s -> encoder.encodeToString(s.getBytes(StandardCharsets.UTF_8)))
            .collect(Collectors.joining("\t"))).toList();
        try {
            Files.write(Path.of(directory, UUID.randomUUID() + ".events"), lines, StandardCharsets.UTF_8);
        } catch (IOException e) {
            // JUnit logs TestWatcher exceptions. Missing evidence must also fail the external gate.
            throw new IllegalStateException(e);
        }
    }
}
