package example;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class OrdersTest {
    @Test void testOrderLookup() {
        var store = mock(OrderStore.class);
        when(store.find("42")).thenReturn(new Order("42", "PENDING"));
        var orders = new Orders(store, mock(CancellationKeys.class), mock(OrderEvents.class));
        assertThat(orders.find("42").state()).isEqualTo("PENDING");
    }
}
