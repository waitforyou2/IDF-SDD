package example;

import isdd.apitest.ApiEvidence;
import isdd.apitest.ApiEvidence.Evidence;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(ApiEvidence.class)
@Import(OrdersIT.FakeConfig.class)
@Execution(ExecutionMode.SAME_THREAD)
class OrdersIT {
    @Autowired MockMvc mvc;
    @Autowired ApplicationContext application;
    @TestConfiguration(proxyBeanMethods = false)
    static class FakeConfig {
        @Bean OrderState orderState() { return new OrderState(); }
    }

    static final class OrderState implements OrderStore, CancellationKeys {
        final Map<String, Order> orders = new HashMap<>();
        final Set<String> claimed = ConcurrentHashMap.newKeySet();
        int writes;

        void reset() {
            orders.clear();
            claimed.clear();
            writes = 0;
        }

        void seed(Order order) { orders.put(order.id(), order); }
        public Order find(String id) { return orders.get(id); }
        public void save(Order order) {
            orders.put(order.id(), order);
            writes++;
        }
        public boolean claim(String id) { return claimed.add(id); }
    }

    @Autowired OrderState state;
    @MockitoBean OrderEvents events;

    @BeforeEach void resetState() { state.reset(); }

    @Test void testFullInventory(Evidence evidence) { evidence.inventory(application); }

    @Test void testRead(Evidence evidence) throws Exception {
        state.seed(new Order("42", "SHIPPED"));
        var result = mvc.perform(get("/orders/42")).andExpect(status().isOk())
            .andExpect(jsonPath("$.state").value("SHIPPED")).andExpect(jsonPath("$.id").value("42")).andReturn();
        evidence.scenario("read-order", result, Orders.class);
    }

    @Test void testRejectShippedOrder(Evidence evidence) throws Exception {
        state.seed(new Order("42", "SHIPPED"));
        var result = mvc.perform(post("/orders/42/cancel")).andExpect(status().isConflict()).andReturn();
        assertThat(state.writes).isZero();
        assertThat(state.find("42").state()).isEqualTo("SHIPPED");
        assertThat(state.claimed).doesNotContain("42");
        verifyNoInteractions(events);
        evidence.scenario("reject-shipped", result, Orders.class);
    }

    @Test void testCancelOnce(Evidence evidence) throws Exception {
        state.seed(new Order("42", "PENDING"));
        state.seed(new Order("43", "PENDING"));
        mvc.perform(post("/orders/42/cancel")).andExpect(status().isNoContent());
        var result = mvc.perform(post("/orders/42/cancel")).andExpect(status().isNoContent()).andReturn();
        mvc.perform(get("/orders/42")).andExpect(status().isOk())
            .andExpect(jsonPath("$.state").value("CANCELLED"));
        assertThat(state.writes).isOne();
        verify(events, only()).cancelled("42");
        mvc.perform(post("/orders/43/cancel")).andExpect(status().isNoContent());
        assertThat(state.writes).isEqualTo(2);
        verify(events).cancelled("43");
        verifyNoMoreInteractions(events);
        evidence.scenario("cancel-once", result, Orders.class);
    }
}
